'use strict';

/**
 * Shared conversion core for OpenAI, Anthropic, Gemini, and Copilot exports.
 * Used by the CLI and the Electron main process.
 */

const PROVIDERS = {
  openai: 'openai',
  anthropic: 'anthropic',
  gemini: 'gemini',
  copilot: 'copilot'
};

function providerLabel(provider) {
  switch (provider) {
    case PROVIDERS.openai:
      return 'OpenAI (ChatGPT)';
    case PROVIDERS.anthropic:
      return 'Anthropic (Claude)';
    case PROVIDERS.gemini:
      return 'Google Gemini';
    case PROVIDERS.copilot:
      return 'Microsoft Copilot';
    default:
      return 'Unknown';
  }
}

function sanitizeFilename(title) {
  return String(title || 'untitled')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

function formatDate(timestampOrIso) {
  let date;
  if (typeof timestampOrIso === 'number') {
    // Heuristic: ms vs seconds
    date = new Date(timestampOrIso > 1e12 ? timestampOrIso : timestampOrIso * 1000);
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

function toUnixSeconds(value) {
  if (value == null) return 0;
  if (typeof value === 'number') {
    return value > 1e12 ? value / 1000 : value;
  }
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms / 1000;
}

function normalizeConversationsArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.conversations)) return data.conversations;
    if (Array.isArray(data.chats)) return data.chats;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.messages) && (data.title || data.name || data.id)) {
      return [data];
    }
  }
  return null;
}

function sampleLooksOpenAI(sample) {
  return sample && sample.mapping && typeof sample.mapping === 'object';
}

function sampleLooksAnthropic(sample) {
  if (!sample || typeof sample !== 'object') return false;
  if (Array.isArray(sample.chat_messages)) return true;
  return Boolean(sample.created_at && sample.name !== undefined && sample.uuid);
}

function sampleLooksGemini(sample) {
  if (!sample || typeof sample !== 'object') return false;
  if (sample.conversation && Array.isArray(sample.conversation.messages)) return true;
  if (!Array.isArray(sample.messages)) return false;
  const first = sample.messages.find(m => m && typeof m === 'object');
  if (!first) return false;
  if (first.role === 'model' || first.author === 'model') return true;
  if (Array.isArray(first.parts)) return true;
  if (first.role === 'user' && (first.parts || first.text || first.content)) {
    // Gemini-ish without OpenAI mapping / Anthropic chat_messages
    return !sample.mapping && !sample.chat_messages;
  }
  return false;
}

function sampleLooksCopilot(sample) {
  if (!sample || typeof sample !== 'object') return false;
  if (Array.isArray(sample.messages)) {
    const first = sample.messages.find(m => m && typeof m === 'object');
    if (!first) return false;
    if (first.messageType || first.author === 'bot' || first.author === 'human') return true;
    if (first.text && (first.author || first.from || first.role === 'bot')) return true;
  }
  if (Array.isArray(sample.chatMessages)) return true;
  if (sample.botName || sample.pluginId || sample.gpts) return true;
  return false;
}

function detectProvider(data) {
  const conversations = normalizeConversationsArray(data);
  if (!conversations || conversations.length === 0) {
    throw new Error('Invalid file format: Expected a non-empty array of conversations');
  }

  const sample = conversations.find(c => c && typeof c === 'object') || conversations[0];

  if (sampleLooksOpenAI(sample)) return PROVIDERS.openai;
  if (sampleLooksAnthropic(sample)) return PROVIDERS.anthropic;
  if (sampleLooksCopilot(sample)) return PROVIDERS.copilot;
  if (sampleLooksGemini(sample)) return PROVIDERS.gemini;

  const hasMapping = conversations.some(c => c && c.mapping);
  const hasChatMessages = conversations.some(c => c && Array.isArray(c.chat_messages));
  const hasGemini = conversations.some(c => sampleLooksGemini(c));
  const hasCopilot = conversations.some(c => sampleLooksCopilot(c));

  if (hasMapping) return PROVIDERS.openai;
  if (hasChatMessages) return PROVIDERS.anthropic;
  if (hasCopilot) return PROVIDERS.copilot;
  if (hasGemini) return PROVIDERS.gemini;

  throw new Error(
    'Unrecognized export format. Expected OpenAI, Anthropic, Gemini, or Copilot conversations.'
  );
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
  if (!mapping || typeof mapping !== 'object') return messages;

  for (const [, node] of Object.entries(mapping)) {
    if (node.message && node.message.content && node.message.content.parts) {
      const message = node.message;
      const role = message.author?.role;
      const content = message.content.parts
        .filter(p => typeof p === 'string')
        .join('\n');
      const attachments = message.metadata?.attachments || [];

      if ((role === 'user' || role === 'assistant') && (content.trim() || attachments.length > 0)) {
        messages.push({
          role,
          content,
          createTime: message.create_time || 0,
          attachments
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
      const parts = [];
      for (const block of message.content) {
        if (!block || typeof block !== 'object') continue;
        if (block.type === 'text' && block.text) {
          parts.push(block.text);
        } else if (block.type === 'thinking' && (block.thinking || block.text)) {
          parts.push(`> *Thinking:* ${block.thinking || block.text}`);
        }
      }
      content = parts.join('\n\n');
    }
    content = formatAnthropicArtifacts(content);

    const attachments = [];
    for (const a of message.attachments || []) {
      attachments.push({
        id: a.id || a.file_id || a.file_name || a.name,
        name: a.file_name || a.name || 'attachment',
        mime_type: a.mime_type || a.media_type,
        extracted_content: a.extracted_content || null
      });
    }
    for (const f of [...(message.files || []), ...(message.files_v2 || [])]) {
      attachments.push({
        id: f.file_uuid || f.id || f.file_name,
        name: f.file_name || 'file',
        mime_type: f.mime_type || f.media_type,
        preview_url: f.preview_url || null,
        extracted_content: f.extracted_content || null
      });
    }

    if (content.trim() || attachments.length > 0) {
      messages.push({
        role,
        content,
        createTime: toUnixSeconds(message.created_at),
        attachments
      });
    }
  }

  messages.sort((a, b) => (a.createTime || 0) - (b.createTime || 0));
  return messages;
}

function extractTextFromGeminiParts(parts) {
  if (!Array.isArray(parts)) return '';
  return parts
    .map(part => {
      if (typeof part === 'string') return part;
      if (part && typeof part.text === 'string') return part.text;
      if (part && typeof part === 'object' && part.thought) {
        return `> *Thinking:* ${part.thought}`;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function extractGeminiMessages(conversation) {
  const messages = [];
  const rawMessages =
    conversation.messages ||
    conversation.conversation?.messages ||
    [];

  for (const message of rawMessages) {
    if (!message || typeof message !== 'object') continue;

    let role = null;
    const author = message.author || message.role || message.sender;
    if (author === 'user' || author === 'human') role = 'user';
    else if (author === 'model' || author === 'assistant' || author === 'bot') role = 'assistant';
    if (!role) continue;

    let content = '';
    if (typeof message.text === 'string') content = message.text;
    else if (Array.isArray(message.parts)) content = extractTextFromGeminiParts(message.parts);
    else if (typeof message.content === 'string') content = message.content;
    else if (Array.isArray(message.content)) content = extractTextFromGeminiParts(message.content);

    const attachments = [];
    for (const a of message.attachments || message.files || []) {
      attachments.push({
        id: a.id || a.file_id || a.name,
        name: a.name || a.file_name || 'attachment',
        mime_type: a.mime_type || a.mimeType,
        extracted_content: a.extracted_content || a.text || null,
        preview_url: a.url || a.preview_url || null
      });
    }

    if (content.trim() || attachments.length > 0) {
      messages.push({
        role,
        content,
        createTime: toUnixSeconds(message.create_time || message.created_at || message.timestamp),
        attachments
      });
    }
  }

  messages.sort((a, b) => (a.createTime || 0) - (b.createTime || 0));
  return messages;
}

function normalizeCopilotRole(message) {
  const author = message.author || message.from || message.role || message.messageType;
  if (!author) return null;
  const value = String(author).toLowerCase();
  if (['user', 'human', 'me'].includes(value)) return 'user';
  if (['assistant', 'bot', 'copilot', 'ai', 'chatgpt'].includes(value)) return 'assistant';
  if (value === 'chat' && message.offense === 'none') return 'assistant';
  return null;
}

function extractCopilotMessages(conversation) {
  const messages = [];
  const rawMessages = conversation.messages || conversation.chatMessages || [];

  for (const message of rawMessages) {
    if (!message || typeof message !== 'object') continue;
    const role = normalizeCopilotRole(message);
    if (!role) continue;

    let content = '';
    if (typeof message.text === 'string') content = message.text;
    else if (typeof message.content === 'string') content = message.content;
    else if (typeof message.message === 'string') content = message.message;
    else if (message.adaptiveCards && Array.isArray(message.adaptiveCards)) {
      content = message.adaptiveCards
        .map(card => {
          try {
            const body = card.body || [];
            return body.map(b => b.text || '').filter(Boolean).join('\n');
          } catch {
            return '';
          }
        })
        .filter(Boolean)
        .join('\n\n');
    }

    const attachments = [];
    for (const a of message.attachments || []) {
      attachments.push({
        id: a.id || a.name,
        name: a.name || 'attachment',
        mime_type: a.contentType || a.mime_type,
        preview_url: a.contentUrl || a.url || null,
        extracted_content: a.text || null
      });
    }

    if (content.trim() || attachments.length > 0) {
      messages.push({
        role,
        content,
        createTime: toUnixSeconds(message.createdAt || message.create_time || message.timestamp),
        attachments
      });
    }
  }

  messages.sort((a, b) => (a.createTime || 0) - (b.createTime || 0));
  return messages;
}

function getConversationMeta(conversation, provider) {
  if (provider === PROVIDERS.anthropic) {
    return {
      title: conversation.name || conversation.title || 'untitled',
      createTime: conversation.created_at || conversation.updated_at || null,
      id: conversation.uuid || conversation.id || null
    };
  }
  if (provider === PROVIDERS.gemini) {
    return {
      title: conversation.title || conversation.name || conversation.conversation?.title || 'untitled',
      createTime:
        conversation.create_time ||
        conversation.created_at ||
        conversation.conversation?.create_time ||
        null,
      id: conversation.id || conversation.conversation?.id || null
    };
  }
  if (provider === PROVIDERS.copilot) {
    return {
      title: conversation.title || conversation.chatName || conversation.name || 'untitled',
      createTime: conversation.createdAt || conversation.create_time || conversation.timestamp || null,
      id: conversation.id || conversation.chatId || null
    };
  }
  return {
    title: conversation.title || conversation.name || 'untitled',
    createTime: conversation.create_time ?? conversation.created_at ?? null,
    id: conversation.id || conversation.conversation_id || null
  };
}

function extractMessages(conversation, provider) {
  switch (provider) {
    case PROVIDERS.anthropic:
      return extractAnthropicMessages(conversation);
    case PROVIDERS.gemini:
      return extractGeminiMessages(conversation);
    case PROVIDERS.copilot:
      return extractCopilotMessages(conversation);
    case PROVIDERS.openai:
      return extractOpenAIMessages(conversation.mapping);
    default: {
      const _exhaustive = provider;
      void _exhaustive;
      return extractOpenAIMessages(conversation.mapping);
    }
  }
}

function countMessages(conversation, provider) {
  return extractMessages(conversation, provider).length;
}

function buildConversationSummaries(data, provider) {
  const conversations = normalizeConversationsArray(data) || [];
  return conversations.map((conversation, index) => {
    const meta = getConversationMeta(conversation, provider);
    const messages = extractMessages(conversation, provider);
    return {
      index,
      id: meta.id || String(index),
      title: meta.title || 'untitled',
      date: formatDate(meta.createTime),
      createTime: toUnixSeconds(meta.createTime),
      messageCount: messages.length,
      hasAttachments: messages.some(m => (m.attachments || []).length > 0)
    };
  });
}

function escapeYamlString(value) {
  const text = String(value ?? '');
  if (/[:#{}[\],&*?|>!%@`]/.test(text) || text.includes('\n') || text.includes('"')) {
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return text;
}

function buildFrontmatter(meta, provider, options = {}) {
  if (!options.obsidianFrontmatter) return '';
  const tags = Array.isArray(options.tags) ? options.tags : ['ai-conversation', provider];
  const lines = [
    '---',
    `title: ${escapeYamlString(meta.title)}`,
    `date: ${formatDate(meta.createTime)}`,
    `source: ${escapeYamlString(providerLabel(provider))}`,
    `provider: ${provider}`,
    `tags: [${tags.map(t => escapeYamlString(t)).join(', ')}]`
  ];
  if (meta.id) lines.push(`conversation_id: ${escapeYamlString(meta.id)}`);
  lines.push('---', '');
  return `${lines.join('\n')}\n`;
}

function getExtensionFromMime(mimeType) {
  const mimeMap = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/x-webp': '.webp',
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/msword': '.doc',
    'text/plain': '.txt',
    'text/csv': '.csv'
  };
  return mimeMap[mimeType] || '';
}

/**
 * Build markdown for a conversation.
 * @param {object} conversation
 * @param {string} provider
 * @param {object} options
 * @param {boolean} [options.obsidianFrontmatter]
 * @param {string} [options.conversationKey]
 * @param {(attachment: object) => Promise<{ markdown: string, copied: boolean }|null>} [options.resolveAttachment]
 */
async function createMarkdown(conversation, provider, options = {}) {
  const messages = extractMessages(conversation, provider);
  const meta = getConversationMeta(conversation, provider);
  const conversationKey =
    options.conversationKey || `${formatDate(meta.createTime)}_${sanitizeFilename(meta.title)}`;

  let markdown = buildFrontmatter(meta, provider, options);
  markdown += `# ${meta.title}\n\n`;
  markdown += `*Source: ${providerLabel(provider)}*\n\n`;

  let hasArtifacts = false;

  for (const message of messages) {
    const roleLabel = message.role === 'user' ? '**User**' : '**Assistant**';
    markdown += `${roleLabel}:\n\n`;

    if (message.attachments && message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        if (typeof options.resolveAttachment === 'function') {
          const resolved = await options.resolveAttachment(attachment, conversationKey);
          if (resolved?.markdown) {
            markdown += resolved.markdown;
            if (resolved.copied) hasArtifacts = true;
            continue;
          }
        }

        if (attachment.extracted_content) {
          hasArtifacts = true;
          markdown += `📎 **Attachment:** ${attachment.name || attachment.id || 'file'}\n\n`;
          markdown += `\`\`\`\n${attachment.extracted_content}\n\`\`\`\n\n`;
        } else if (attachment.preview_url) {
          markdown += `📎 [${attachment.name || 'Attachment'}](${attachment.preview_url}) *(signed URL may expire)*\n\n`;
        } else if (provider === PROVIDERS.anthropic || provider === PROVIDERS.gemini || provider === PROVIDERS.copilot) {
          markdown += `📎 *Attachment: ${attachment.name || attachment.id || 'file'} (not included in export)*\n\n`;
        } else {
          markdown += `📎 *Attachment: ${attachment.name || attachment.id || 'file'} (not found in source)*\n\n`;
        }
      }
    }

    if (message.content && message.content.trim()) {
      markdown += `${message.content}\n\n`;
    }

    markdown += `---\n\n`;
  }

  return { markdown, hasArtifacts, meta, conversationKey, messageCount: messages.length };
}

function buildIndexMarkdown(entries, provider, options = {}) {
  const title = options.title || 'Conversation Index';
  let markdown = '';
  if (options.obsidianFrontmatter) {
    markdown += [
      '---',
      `title: ${escapeYamlString(title)}`,
      `date: ${formatDate(Date.now() / 1000)}`,
      `source: ${escapeYamlString(providerLabel(provider))}`,
      'tags: [ai-conversation, index]',
      '---',
      ''
    ].join('\n');
  }
  markdown += `# ${title}\n\n`;
  markdown += `*Source: ${providerLabel(provider)}*\n\n`;
  markdown += `| Date | Title | Messages |\n| --- | --- | --- |\n`;
  for (const entry of entries) {
    const linkTarget = options.obsidianFrontmatter
      ? entry.relativePath.replace(/\.md$/i, '')
      : entry.relativePath;
    const titleLink = options.obsidianFrontmatter
      ? `[[${linkTarget}|${entry.title}]]`
      : `[${entry.title}](${entry.relativePath})`;
    markdown += `| ${entry.date} | ${titleLink} | ${entry.messageCount} |\n`;
  }
  return markdown;
}

function conversationOutputPath(meta, options = {}) {
  const date = formatDate(meta.createTime);
  const title = sanitizeFilename(meta.title);
  const conversationKey = `${date}_${title}`;
  const fileName = `${conversationKey}.md`;
  if (options.dateFolders) {
    return {
      conversationKey,
      relativeDir: date,
      relativePath: `${date}/${fileName}`,
      fileName
    };
  }
  return {
    conversationKey,
    relativeDir: '',
    relativePath: fileName,
    fileName
  };
}

function parseFileArtifactId(fileName) {
  if (!fileName || typeof fileName !== 'string') return null;
  if (!fileName.toLowerCase().startsWith('file-')) return null;
  const nameWithoutPrefix = fileName.substring(5);
  const dashIndex = nameWithoutPrefix.indexOf('-');
  const dotIndex = nameWithoutPrefix.indexOf('.');
  if (dashIndex > 0) return `file-${nameWithoutPrefix.substring(0, dashIndex)}`;
  if (dotIndex > 0) return `file-${nameWithoutPrefix.substring(0, dotIndex)}`;
  return `file-${nameWithoutPrefix}`;
}

module.exports = {
  PROVIDERS,
  providerLabel,
  sanitizeFilename,
  formatDate,
  toUnixSeconds,
  normalizeConversationsArray,
  detectProvider,
  formatAnthropicArtifacts,
  extractMessages,
  extractOpenAIMessages,
  extractAnthropicMessages,
  extractGeminiMessages,
  extractCopilotMessages,
  getConversationMeta,
  countMessages,
  buildConversationSummaries,
  createMarkdown,
  buildIndexMarkdown,
  conversationOutputPath,
  getExtensionFromMime,
  parseFileArtifactId,
  buildFrontmatter
};
