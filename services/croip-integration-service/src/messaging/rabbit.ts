import * as amqp from 'amqplib';
import { config } from '../config';

let connection: amqp.ChannelModel | null = null;
let channelPromise: Promise<amqp.Channel> | null = null;

export async function getConnection(): Promise<amqp.ChannelModel> {
  if (!connection) {
    connection = await amqp.connect(config.rabbitmqUrl);
    connection.on('error', (err) => {
      console.error('[rabbit] connection error', err);
    });
    connection.on('close', () => {
      connection = null;
      channelPromise = null;
    });
  }
  return connection;
}

export async function getChannel(): Promise<amqp.Channel> {
  if (!channelPromise) {
    channelPromise = (async () => {
      const conn = await getConnection();
      const channel = await conn.createChannel();
      await channel.assertExchange(config.rabbitmqExchange, 'topic', { durable: true });
      return channel;
    })();
  }
  return channelPromise;
}

export async function closeMessaging(): Promise<void> {
  if (channelPromise) {
    try {
      await (await channelPromise).close();
    } catch {
      // channel already closed
    }
    channelPromise = null;
  }

  if (connection) {
    try {
      await connection.close();
    } catch {
      // connection already closed
    }
    connection = null;
  }
}
