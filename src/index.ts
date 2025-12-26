import 'dotenv/config';
import { Consumer } from 'sqs-consumer';
import { SQSClient } from '@aws-sdk/client-sqs';
import { YoutubeTranscript } from './youtube-transcript.js';

type Payload = {
  videoId: string;
  author: string;
  link: string;
};

const awsRegion = process.env['AWS_REGION'] ?? 'us-east-1';
const sqsQueueUrl = process.env['SQS_QUEUE_URL']!;
if (!sqsQueueUrl) {
  throw new Error('SQS_QUEUE_URL environment variable is required');
}
const endpointUrl = process.env['ENDPOINT_URL'];
if (!endpointUrl) {
  throw new Error('ENDPOINT_URL environment variable is required');
}

const endpointApiKey = process.env['ENDPOINT_API_KEY'];
if (!endpointApiKey) {
  throw new Error('ENDPOINT_API_KEY environment variable is required');
}

console.log(`Queue: ${sqsQueueUrl}`);
console.log(`Endpoint: ${endpointUrl}`);

const sqsClient = new SQSClient({ region: awsRegion });

const consumer = Consumer.create({
  queueUrl: sqsQueueUrl,
  sqs: sqsClient,
  batchSize: 1,
  visibilityTimeout: 60,
  handleMessage: async message => {
    console.log(`Processing message: ${message.MessageId}`);
    try {
      const payload = JSON.parse(message.Body!) as Payload;
      const raw = await YoutubeTranscript.fetchTranscript(payload.videoId);
      const transcript = raw.map(item => item.text).join(' ');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': endpointApiKey,
        },
        body: JSON.stringify({
          transcript,
          videoId: payload.videoId,
          author: payload.author,
          link: payload.link,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status == 200) {
        console.log(`Successfully processed message ${message.MessageId}`);
        return message;
      } else {
        console.error(
          `Failed to process message ${message.MessageId}: ${response.status}`
        );
      }
    } catch (error) {
      console.error(`Error processing message ${message.MessageId}:`, error);
    }
    return undefined;
  },
});

consumer.on('error', err => {
  console.error('Consumer error:', err.message);
});

consumer.on('processing_error', err => {
  console.error('Processing error:', err.message);
});

consumer.on('started', () => {
  console.log('Consumer started');
});

consumer.on('stopped', () => {
  console.log('Consumer stopped');
});

consumer.start();

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT. Shutting down gracefully...');
  consumer.stop();
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM. Shutting down gracefully...');
  consumer.stop();
});
