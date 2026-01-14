import 'dotenv/config';
import { Consumer } from 'sqs-consumer';
import { SQSClient } from '@aws-sdk/client-sqs';
import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptVideoStatusError,
} from './youtube-transcript.js';
import {
  CreateScheduleCommand,
  SchedulerClient,
} from '@aws-sdk/client-scheduler';

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

const schedulerClient = new SchedulerClient({ region: 'us-east-1' });

const consumer = Consumer.create({
  queueUrl: sqsQueueUrl,
  sqs: sqsClient,
  batchSize: 1,
  visibilityTimeout: 60,
  handleMessage: async message => {
    console.log(`Processing message: ${message.MessageId}`);
    const payload = JSON.parse(message.Body!) as Payload;
    try {
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
      if (error instanceof YoutubeTranscriptDisabledError) {
        console.warn(error.message);
        return message;
      }
      if (error instanceof YoutubeTranscriptVideoStatusError) {
        if (error.reason && error.reason.includes('Video unavailable')) {
          console.warn(error.message);
          return message;
        }
        if (error.status === 'LIVE_STREAM_OFFLINE') {
          const schedulerRoleArn = process.env['SCHEDULER_ROLE_ARN']!;
          const sqsQueueArn = process.env['SQS_ARN']!;
          if (schedulerRoleArn && sqsQueueArn) {
            const executeAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            // Format: yyyy-MM-ddTHH:mm:ss
            const scheduleTime = executeAt.toISOString().slice(0, 19);
            console.warn(
              `Reschedule message ${message.MessageId}(${payload.videoId}) for ${executeAt.toISOString()}`
            );
            await schedulerClient.send(
              new CreateScheduleCommand({
                Name: `one-time-${Date.now()}`,
                ScheduleExpression: `at(${scheduleTime})`,
                Target: {
                  Arn: sqsQueueArn,
                  RoleArn: schedulerRoleArn,
                  Input: message.Body,
                },
                FlexibleTimeWindow: { Mode: 'OFF' },
                ActionAfterCompletion: 'DELETE',
              })
            );
          } else {
            console.warn(error.message);
          }
          return message;
        }
      }
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
