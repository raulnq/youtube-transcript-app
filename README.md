# YouTube Transcript App

A Node.js application that consumes messages from an AWS SQS queue, fetches YouTube video transcripts, and posts them to a configured endpoint.

## Features

- Polls an SQS queue for messages containing YouTube video IDs
- Fetches transcripts from YouTube videos using the YouTube InnerTube API
- Posts the transcript content to a configurable HTTP endpoint
- Automatic message deletion after successful processing
- Graceful shutdown handling (SIGINT/SIGTERM)

## Prerequisites

- Node.js 18+
- AWS credentials with SQS access
- An SQS queue configured to receive messages

## Installation

```bash
npm install
```

## Configuration

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

### Environment Variables

| Variable                | Description                       | Required |
| ----------------------- | --------------------------------- | -------- |
| `AWS_REGION`            | AWS region (default: `us-east-1`) | No       |
| `AWS_ACCESS_KEY_ID`     | AWS access key ID                 | Yes\*    |
| `AWS_SECRET_ACCESS_KEY` | AWS secret access key             | Yes\*    |
| `SQS_QUEUE_URL`         | Full URL of the SQS queue         | Yes      |
| `ENDPOINT_URL`          | URL to POST transcript data to    | Yes      |

\*AWS credentials can also be provided via AWS CLI configuration, IAM roles, or other standard AWS credential providers.

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## SQS Message Format

The application expects SQS messages with the following JSON payload:

```json
{
  "videoId": "dQw4w9WgXcQ"
}
```

The `videoId` can be either:

- A YouTube video ID (11 characters)
- A full YouTube URL

## Endpoint Payload

The application POSTs the following JSON to the configured endpoint:

```json
{
  "transcript": "Full transcript text concatenated from all segments..."
}
```

## Scripts

| Script                 | Description                             |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | Run in development mode with hot reload |
| `npm run build`        | Compile TypeScript to JavaScript        |
| `npm start`            | Run the compiled application            |
| `npm run lint`         | Run ESLint                              |
| `npm run lint:fix`     | Run ESLint with auto-fix                |
| `npm run format`       | Format code with Prettier               |
| `npm run format:check` | Check code formatting                   |
| `npm run lint:format`  | Run both lint fix and format            |

## License

ISC
