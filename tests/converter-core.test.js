'use strict';

const assert = require('assert');
const path = require('path');
const core = require(path.join(__dirname, '..', 'viewer', 'lib', 'converter-core'));

function testDetectOpenAI() {
  const provider = core.detectProvider([
    { title: 'Hi', create_time: 1700000000, mapping: { a: { message: null } } }
  ]);
  assert.strictEqual(provider, 'openai');
}

function testDetectAnthropic() {
  const provider = core.detectProvider([
    {
      name: 'Claude chat',
      created_at: '2024-01-01T00:00:00Z',
      chat_messages: [{ sender: 'human', text: 'Hello', created_at: '2024-01-01T00:00:00Z' }]
    }
  ]);
  assert.strictEqual(provider, 'anthropic');
}

function testDetectGemini() {
  const provider = core.detectProvider([
    {
      title: 'Gemini chat',
      messages: [
        { role: 'user', parts: [{ text: 'Hi' }] },
        { role: 'model', parts: [{ text: 'Hello' }] }
      ]
    }
  ]);
  assert.strictEqual(provider, 'gemini');
}

function testDetectCopilot() {
  const provider = core.detectProvider([
    {
      title: 'Copilot chat',
      messages: [
        { author: 'user', text: 'Hi', createdAt: '2024-01-01T00:00:00Z' },
        { author: 'bot', text: 'Hello', createdAt: '2024-01-01T00:00:01Z' }
      ]
    }
  ]);
  assert.strictEqual(provider, 'copilot');
}

async function testMarkdownAndFrontmatter() {
  const conversation = {
    title: 'Sample: Test',
    create_time: 1700000000,
    mapping: {
      n1: {
        message: {
          author: { role: 'user' },
          content: { parts: ['Hello world'] },
          create_time: 1700000000
        }
      },
      n2: {
        message: {
          author: { role: 'assistant' },
          content: { parts: ['Hi there'] },
          create_time: 1700000001
        }
      }
    }
  };

  const result = await core.createMarkdown(conversation, 'openai', {
    obsidianFrontmatter: true
  });
  assert.ok(result.markdown.startsWith('---\n'));
  assert.ok(result.markdown.includes('title: "Sample: Test"') || result.markdown.includes('title: Sample: Test'));
  assert.ok(result.markdown.includes('**User**'));
  assert.ok(result.markdown.includes('Hello world'));
  assert.strictEqual(result.messageCount, 2);
}

function testSummaries() {
  const summaries = core.buildConversationSummaries(
    [
      {
        title: 'A',
        create_time: 1700000000,
        mapping: {
          n1: {
            message: {
              author: { role: 'user' },
              content: { parts: ['x'] },
              create_time: 1700000000
            }
          }
        }
      }
    ],
    'openai'
  );
  assert.strictEqual(summaries.length, 1);
  assert.strictEqual(summaries[0].messageCount, 1);
}

function testDateFoldersPath() {
  const paths = core.conversationOutputPath(
    { title: 'Hello World', createTime: 1700000000 },
    { dateFolders: true }
  );
  assert.ok(paths.relativePath.startsWith('2023-11-14/') || paths.relativePath.includes('/'));
  assert.ok(paths.relativePath.endsWith('.md'));
}

async function run() {
  testDetectOpenAI();
  testDetectAnthropic();
  testDetectGemini();
  testDetectCopilot();
  await testMarkdownAndFrontmatter();
  testSummaries();
  testDateFoldersPath();
  console.log('All converter-core tests passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
