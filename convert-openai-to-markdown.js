#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Convert OpenAI or Anthropic (Claude) conversation exports to markdown files
 * Usage: node convert-openai-to-markdown.js <input-json-file> [output-directory]
 */

function sanitizeFilename(title) {
  return title
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

function formatDate(timestampOrIso) {
  let date;
  if (typeof timestampOrIso === 'number') {
    date = new Date(timestampOrIso * 1000);
  } else if (typeof timestampOrIso === 'string') {
    date = new Date(timestampOrIso);
  } else {
    date = new Date();
  }
  if (Number.isNaN(date.getTime())) {
    date = new Date();
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function detectProvider(data) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Invalid file format: Expected a non-empty array of conversations');
  }
  const sample = data.find(c => c && typeof c === 'object') || data[0];
  if (sample.mapping && typeof sample.mapping === 'object') {
    return 'openai';
  }
  if (Array.isArray(sample.chat_messages) || (sample.created_at && sample.name !== undefined)) {
    return 'anthropic';
  }
  const hasMapping = data.some(c => c && c.mapping);
  const hasChatMessages = data.some(c => c && Array.isArray(c.chat_messages));
  if (hasMapping) return 'openai';
  if (hasChatMessages) return 'anthropic';
  throw new Error('Unrecognized export format. Expected OpenAI (mapping) or Anthropic (chat_messages).');
}

function formatAnthropicArtifacts(text) {
  if (!text || typeof text !== 'string') return text || '';
  return text.replace(
    /<antArtifact\b([^>]*)>([\s\S]*?)<\/antArtifact>/gi,
    (match, attrs, body) => {
      const title = (attrs.match(/\btitle="([^"]*)"/i) || [])[1] || 'Artifact';
      const type = (attrs.match(/\btype="([^"]*)"/i) || [])[1] || '';
      const language = (attrs.match(/\blanguage="([^"]*)"/i) || [])[1] || '';
      let fence = language;
      if (!fence) {
        if (/markdown/i.test(type)) fence = 'markdown';
        else if (/html/i.test(type)) fence = 'html';
        else if (/svg/i.test(type)) fence = 'svg';
        else if (/react|jsx/i.test(type)) fence = 'jsx';
        else if (/mermaid/i.test(type)) fence = 'mermaid';
        else if (/python/i.test(type)) fence = 'python';
        else if (/javascript|application\/vnd\.ant\.code/i.test(type)) fence = 'javascript';
      }
      return `\n\n### Artifact: ${title}\n\n\`\`\`${fence}\n${body.trim()}\n\`\`\`\n\n`;
    }
  );
}

function extractOpenAIMessages(mapping) {
  const messages = [];

  for (const [, node] of Object.entries(mapping || {})) {
    if (node.message && node.message.content && node.message.content.parts) {
      const message = node.message;
      const role = message.author.role;
      const content = message.content.parts
        .filter(p => typeof p === 'string')
        .join('\n');

      if ((role === 'user' || role === 'assistant') && content.trim()) {
        messages.push({
          role,
          content,
          createTime: message.create_time
        });
      }
    }
  }

  messages.sort((a, b) => (a.createTime || 0) - (b.createTime || 0));
  return messages;
}

function extractAnthropicMessages(conversation) {
  const messages = [];

  for (const message of conversation.chat_messages || []) {
    const sender = message.sender;
    let role = null;
    if (sender === 'human' || sender === 'user') role = 'user';
    else if (sender === 'assistant') role = 'assistant';
    if (!role) continue;

    let content = '';
    if (typeof message.text === 'string' && message.text.trim()) {
      content = message.text;
    } else if (Array.isArray(message.content)) {
      content = message.content
        .filter(b => b && b.type === 'text' && b.text)
        .map(b => b.text)
        .join('\n\n');
    }
    content = formatAnthropicArtifacts(content);

    const attachmentNotes = [];
    for (const a of message.attachments || []) {
      const name = a.file_name || a.name || 'attachment';
      if (a.extracted_content) {
        attachmentNotes.push(`📎 **Attachment:** ${name}\n\n\`\`\`\n${a.extracted_content}\n\`\`\``);
      } else {
        attachmentNotes.push(`📎 *Attachment: ${name}*`);
      }
    }
    for (const f of [...(message.files || []), ...(message.files_v2 || [])]) {
      const name = f.file_name || 'file';
      if (f.preview_url) {
        attachmentNotes.push(`📎 [${name}](${f.preview_url}) *(signed URL may expire)*`);
      } else if (f.extracted_content) {
        attachmentNotes.push(`📎 **Attachment:** ${name}\n\n\`\`\`\n${f.extracted_content}\n\`\`\``);
      } else {
        attachmentNotes.push(`📎 *Attachment: ${name}*`);
      }
    }

    if (attachmentNotes.length) {
      content = `${attachmentNotes.join('\n\n')}\n\n${content}`.trim();
    }

    if (content.trim()) {
      const created = message.created_at ? new Date(message.created_at).getTime() / 1000 : 0;
      messages.push({
        role,
        content,
        createTime: Number.isNaN(created) ? 0 : created
      });
    }
  }

  messages.sort((a, b) => (a.createTime || 0) - (b.createTime || 0));
  return messages;
}

function getConversationMeta(conversation, provider) {
  if (provider === 'anthropic') {
    return {
      title: conversation.name || conversation.title || 'untitled',
      createTime: conversation.created_at || conversation.updated_at || null
    };
  }
  return {
    title: conversation.title || conversation.name || 'untitled',
    createTime: conversation.create_time ?? conversation.created_at ?? null
  };
}

function createMarkdown(conversation, provider) {
  const messages = provider === 'anthropic'
    ? extractAnthropicMessages(conversation)
    : extractOpenAIMessages(conversation.mapping);
  const meta = getConversationMeta(conversation, provider);

  let markdown = `# ${meta.title}\n\n`;
  markdown += `*Source: ${provider === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI (ChatGPT)'}*\n\n`;

  for (const message of messages) {
    const roleLabel = message.role === 'user' ? '**User**' : '**Assistant**';
    markdown += `${roleLabel}:\n\n${message.content}\n\n---\n\n`;
  }

  return markdown;
}

function processConversations(inputFile, outputDir) {
  console.log(`Reading ${inputFile}...`);
  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const provider = detectProvider(data);
  console.log(`Detected provider: ${provider === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI (ChatGPT)'}`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let processedCount = 0;

  for (const conversation of data) {
    try {
      const meta = getConversationMeta(conversation, provider);
      const date = formatDate(meta.createTime);
      const title = sanitizeFilename(meta.title);
      const filename = `${date}_${title}.md`;
      const filepath = path.join(outputDir, filename);

      const markdown = createMarkdown(conversation, provider);
      fs.writeFileSync(filepath, markdown, 'utf8');
      console.log(`Created: ${filename}`);
      processedCount++;
    } catch (error) {
      const failTitle = conversation.title || conversation.name || 'untitled';
      console.error(`Error processing conversation "${failTitle}":`, error.message);
    }
  }

  console.log(`\nProcessed ${processedCount} conversations into ${outputDir}`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: node convert-openai-to-markdown.js <input-json-file> [output-directory]');
    console.log('');
    console.log('Supports OpenAI (ChatGPT) and Anthropic (Claude) conversations.json exports.');
    console.log('Example: node convert-openai-to-markdown.js conversations.json ./markdown-output');
    process.exit(1);
  }

  const inputFile = args[0];
  const outputDir = args[1] || './markdown-output';

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: Input file "${inputFile}" not found`);
    process.exit(1);
  }

  processConversations(inputFile, outputDir);
}

main();
