const { ipcRenderer } = require('electron');
const CodeMirror = require('codemirror');
require('codemirror/mode/markdown/markdown');
require('codemirror/mode/gfm/gfm');
require('codemirror/mode/javascript/javascript');
require('codemirror/mode/python/python');
require('codemirror/mode/css/css');
require('codemirror/mode/xml/xml');
require('codemirror/mode/htmlmixed/htmlmixed');
require('codemirror/mode/clike/clike');
require('codemirror/mode/shell/shell');
require('codemirror/addon/edit/continuelist');
require('codemirror/addon/selection/active-line');

// 获取 DOM 元素
const editorContainer = document.getElementById('editor');
const preview = document.getElementById('preview');
const previewContent = document.getElementById('previewContent');
const editorPane = document.getElementById('editorPane');
const previewPane = document.getElementById('previewPane');
const fileName = document.getElementById('fileName');
const fileModified = document.getElementById('fileModified');
const lineCount = document.getElementById('lineCount');
const wordCount = document.getElementById('wordCount');
const charCount = document.getElementById('charCount');
const status = document.getElementById('status');
const printArea = document.getElementById('printArea');
const resizer = document.getElementById('resizer');
const headingBtn = document.getElementById('headingBtn');
const headingMenu = document.getElementById('headingMenu');

// 设置相关 DOM
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const saveSettingsBtn = document.getElementById('saveSettings');
const imageStorageType = document.getElementById('imageStorageType');
const imgbedSettings = document.getElementById('imgbedSettings');
const imgbedType = document.getElementById('imgbedType');
const imgbedToken = document.getElementById('imgbedToken');
const customUrlSetting = document.getElementById('customUrlSetting');
const imgbedCustomUrl = document.getElementById('imgbedCustomUrl');
const wysiwygModeBtn = document.getElementById('wysiwygModeBtn');
const sourceModeBtn = document.getElementById('sourceModeBtn');

// 编辑模式: 'wysiwyg' 所见即所得, 'source' 源码模式
let editMode = 'wysiwyg';

// 初始化 Turndown (HTML to Markdown)
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  bulletListMarker: '-',
  hr: '---'
});

// 使用 GFM 插件支持表格和任务列表
turndownService.use(turndownPluginGfm.gfm);

// 自定义规则：保留图片宽度参数
turndownService.addRule('imageWithWidth', {
  filter: function(node) {
    return node.nodeName === 'IMG' && node.style.width;
  },
  replacement: function(content, node) {
    const alt = node.alt || '';
    let src = node.getAttribute('src') || '';
    // 移除 file:// 前缀
    src = src.replace(/^file:\/\//, '');
    // 解析宽度
    const widthMatch = node.style.width.match(/(\d+)/);
    if (widthMatch) {
      const width = widthMatch[1];
      // 检查 src 是否已有 ?w= 参数
      if (src.includes('?w=')) {
        src = src.replace(/\?w=\d+/, `?w=${width}`);
      } else {
        src += `?w=${width}`;
      }
    }
    const title = node.title ? ` "${node.title}"` : '';
    return `![${alt}](${src}${title})`;
  }
});

// 自定义规则：处理代码块包装器
turndownService.addRule('codeBlockWrapper', {
  filter: function(node) {
    return node.classList && node.classList.contains('code-block-wrapper');
  },
  replacement: function(content, node) {
    const lang = node.dataset.lang || '';
    const codeElement = node.querySelector('code');
    // 使用 textContent 获取纯文本（会自动去除所有 HTML 标签）
    let code = codeElement ? codeElement.textContent : '';
    // 确保代码末尾没有多余的换行
    code = code.replace(/\n$/, '');
    return '\n\n```' + lang + '\n' + code + '\n```\n\n';
  }
});

// 初始化 CodeMirror 编辑器
const editor = CodeMirror(editorContainer, {
  mode: 'gfm',
  theme: 'default',
  lineNumbers: false,
  lineWrapping: true,
  styleActiveLine: true,
  extraKeys: {
    'Enter': 'newlineAndIndentContinueMarkdownList',
    'Cmd-B': () => wrapSelection('**', '**'),
    'Ctrl-B': () => wrapSelection('**', '**'),
    'Cmd-I': () => wrapSelection('*', '*'),
    'Ctrl-I': () => wrapSelection('*', '*'),
  },
  placeholder: '开始输入 Markdown...'
});

// 当前文件路径
let currentDocPath = null;

// 格式化功能
const formatActions = {
  h1: () => insertLinePrefix('# '),
  h2: () => insertLinePrefix('## '),
  h3: () => insertLinePrefix('### '),
  h4: () => insertLinePrefix('#### '),
  h5: () => insertLinePrefix('##### '),
  h6: () => insertLinePrefix('###### '),
  paragraph: () => removeLinePrefix(),
  bold: () => wrapSelection('**', '**'),
  italic: () => wrapSelection('*', '*'),
  strikethrough: () => wrapSelection('~~', '~~'),
  code: () => wrapSelection('`', '`'),
  ul: () => insertLinePrefix('- '),
  ol: () => insertOrderedList(),
  task: () => insertLinePrefix('- [ ] '),
  quote: () => insertLinePrefix('> '),
  link: () => insertLink(),
  image: () => insertImage(),
  codeblock: () => insertCodeBlock(),
  table: () => insertTable(),
  hr: () => insertAtCursor('\n---\n')
};

// 在光标位置插入文本
function insertAtCursor(text) {
  const cursor = editor.getCursor();
  editor.replaceRange(text, cursor);
  editor.focus();
  updatePreview();
  updateStats();
}

// 在行首插入前缀
function insertLinePrefix(prefix) {
  const cursor = editor.getCursor();
  const line = cursor.line;
  const lineContent = editor.getLine(line);
  
  // 检查是否已有标题前缀，如果有则替换
  const headingMatch = lineContent.match(/^(#{1,6}\s)/);
  
  if (headingMatch && prefix.startsWith('#')) {
    // 替换现有标题
    editor.replaceRange(prefix, {line: line, ch: 0}, {line: line, ch: headingMatch[1].length});
  } else {
    // 插入新前缀
    editor.replaceRange(prefix, {line: line, ch: 0});
  }
  
  editor.focus();
  updatePreview();
  updateStats();
}

// 移除行首前缀（转为正文）
function removeLinePrefix() {
  const from = editor.getCursor('from');
  const to = editor.getCursor('to');
  
  // 处理选中的所有行
  for (let line = from.line; line <= to.line; line++) {
    const lineContent = editor.getLine(line);
    
    // 匹配标题、列表、引用等前缀
    const prefixMatch = lineContent.match(/^(#{1,6}\s+|- \[[ x]\]\s+|- |\* |\d+\.\s+|> +)/);
    
    if (prefixMatch) {
      // 移除前缀
      editor.replaceRange('', {line: line, ch: 0}, {line: line, ch: prefixMatch[1].length});
    }
  }
  
  editor.focus();
  updatePreview();
  updateStats();
}

// 包裹选中文本
function wrapSelection(before, after) {
  const selection = editor.getSelection();
  const placeholder = selection || '文本';
  const newText = before + placeholder + after;
  
  editor.replaceSelection(newText);
  
  if (!selection) {
    // 选中占位文本
    const cursor = editor.getCursor();
    editor.setSelection(
      {line: cursor.line, ch: cursor.ch - after.length - placeholder.length},
      {line: cursor.line, ch: cursor.ch - after.length}
    );
  }
  
  editor.focus();
  updatePreview();
  updateStats();
}

// 插入有序列表
function insertOrderedList() {
  const cursor = editor.getCursor();
  const line = cursor.line;
  
  // 检查上一行是否是有序列表，获取编号
  let num = 1;
  if (line > 0) {
    const prevLine = editor.getLine(line - 1);
    const match = prevLine.match(/^(\d+)\. /);
    if (match) {
      num = parseInt(match[1]) + 1;
    }
  }
  
  insertLinePrefix(`${num}. `);
}

// 插入链接
function insertLink() {
  const selection = editor.getSelection();
  const linkText = selection || '链接文本';
  const newText = `[${linkText}](url)`;
  
  editor.replaceSelection(newText);
  
  // 选中 url 部分
  const cursor = editor.getCursor();
  editor.setSelection(
    {line: cursor.line, ch: cursor.ch - 4},
    {line: cursor.line, ch: cursor.ch - 1}
  );
  
  editor.focus();
  updatePreview();
  updateStats();
}

// 插入图片
function insertImage() {
  const selection = editor.getSelection();
  const altText = selection || '图片描述';
  const newText = `![${altText}](图片链接)`;
  
  editor.replaceSelection(newText);
  
  // 选中图片链接部分
  const cursor = editor.getCursor();
  editor.setSelection(
    {line: cursor.line, ch: cursor.ch - 5},
    {line: cursor.line, ch: cursor.ch - 1}
  );
  
  editor.focus();
  updatePreview();
  updateStats();
}

// 插入代码块
function insertCodeBlock() {
  const selection = editor.getSelection();
  const code = selection || '代码';
  const newText = '\n```\n' + code + '\n```\n';
  
  editor.replaceSelection(newText);
  editor.focus();
  updatePreview();
  updateStats();
}

// 插入表格
function insertTable() {
  const tableTemplate = `
| 列1 | 列2 | 列3 |
| --- | --- | --- |
| 内容 | 内容 | 内容 |
`;
  insertAtCursor(tableTemplate);
}

// WYSIWYG 模式下的格式操作
const wysiwygFormatActions = {
  bold: () => document.execCommand('bold'),
  italic: () => document.execCommand('italic'),
  strikethrough: () => document.execCommand('strikeThrough'),
  code: () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const code = document.createElement('code');
      code.textContent = range.toString();
      range.deleteContents();
      range.insertNode(code);
    }
  },
  h1: () => document.execCommand('formatBlock', false, 'h1'),
  h2: () => document.execCommand('formatBlock', false, 'h2'),
  h3: () => document.execCommand('formatBlock', false, 'h3'),
  h4: () => document.execCommand('formatBlock', false, 'h4'),
  h5: () => document.execCommand('formatBlock', false, 'h5'),
  h6: () => document.execCommand('formatBlock', false, 'h6'),
  paragraph: () => document.execCommand('formatBlock', false, 'p'),
  ul: () => document.execCommand('insertUnorderedList'),
  ol: () => document.execCommand('insertOrderedList'),
  quote: () => document.execCommand('formatBlock', false, 'blockquote'),
  hr: () => document.execCommand('insertHorizontalRule'),
  link: () => {
    const url = prompt('输入链接地址:', 'https://');
    if (url) {
      document.execCommand('createLink', false, url);
    }
  }
};

// 绑定格式按钮事件
document.querySelectorAll('.format-btn[data-format]').forEach(btn => {
  btn.addEventListener('click', () => {
    const format = btn.dataset.format;
    
    // WYSIWYG 模式
    if (editMode === 'wysiwyg') {
      if (wysiwygFormatActions[format]) {
        wysiwygFormatActions[format]();
        previewContent.focus();
        // 同步到源码
        setTimeout(() => {
          syncWysiwygToSource();
          markModified();
        }, 50);
      } else if (formatActions[format]) {
        // 没有 WYSIWYG 实现的，切换到源码模式执行
        switchEditMode('source');
        formatActions[format]();
      }
    } else {
      // 源码模式
      if (formatActions[format]) {
        formatActions[format]();
      }
    }
  });
});

// 标题下拉菜单
headingBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  headingMenu.classList.toggle('show');
});

headingMenu.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const format = btn.dataset.format;
    
    if (editMode === 'wysiwyg') {
      if (wysiwygFormatActions[format]) {
        wysiwygFormatActions[format]();
        previewContent.focus();
        setTimeout(() => {
          syncWysiwygToSource();
          markModified();
        }, 50);
      }
    } else {
      if (formatActions[format]) {
        formatActions[format]();
      }
    }
    headingMenu.classList.remove('show');
  });
});

// 点击其他地方关闭下拉菜单
document.addEventListener('click', () => {
  headingMenu.classList.remove('show');
});

// 键盘快捷键 - 注意 WYSIWYG 模式的快捷键在 setupWysiwygEditing 中处理
document.addEventListener('keydown', (e) => {
  // 只在源码模式下处理这里的快捷键
  if (editMode === 'source' && (e.metaKey || e.ctrlKey)) {
    switch(e.key.toLowerCase()) {
      case 'b':
        e.preventDefault();
        formatActions.bold();
        break;
      case 'i':
        e.preventDefault();
        formatActions.italic();
        break;
    }
  }
});

// 拖拽分割线逻辑
let isResizing = false;

resizer.addEventListener('mousedown', (e) => {
  isResizing = true;
  resizer.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  
  const container = document.querySelector('.main-content');
  const containerRect = container.getBoundingClientRect();
  const resizerWidth = resizer.offsetWidth;
  
  // 计算鼠标位置相对于容器的百分比
  let percentage = ((e.clientX - containerRect.left) / containerRect.width) * 100;
  
  // 限制范围在 20% 到 80% 之间
  percentage = Math.max(20, Math.min(80, percentage));
  
  // 设置编辑器和预览区的宽度
  editorPane.style.flex = 'none';
  previewPane.style.flex = 'none';
  editorPane.style.width = `calc(${percentage}% - ${resizerWidth / 2}px)`;
  previewPane.style.width = `calc(${100 - percentage}% - ${resizerWidth / 2}px)`;
});

document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
});

// 自定义 marked 渲染器以支持图片尺寸语法和代码块
const renderer = new marked.Renderer();

renderer.image = function(token) {
  // marked 新版本传入的是 token 对象
  let href = typeof token === 'object' ? token.href : token;
  let text = typeof token === 'object' ? (token.text || '') : arguments[2] || '';
  let title = typeof token === 'object' ? token.title : arguments[1];
  
  // 检查是否有尺寸参数: path?w=width
  let width = null;
  let cleanHref = href;
  
  // 支持 ?w=300 格式
  const urlMatch = href.match(/^(.+?)\?w=(\d+)$/);
  if (urlMatch) {
    cleanHref = urlMatch[1];
    width = urlMatch[2];
  }
  
  let img = `<img src="${cleanHref}" alt="${text}"`;
  if (title) {
    img += ` title="${title}"`;
  }
  if (width) {
    img += ` style="width: ${width}px; height: auto;"`;
  }
  img += '>';
  
  return img;
};

// 自定义代码块渲染 - Typora 风格
renderer.code = function(token) {
  const code = typeof token === 'object' ? (token.text || '') : (token || '');
  const lang = typeof token === 'object' ? (token.lang || '') : (arguments[1] || '');
  
  let highlightedCode = code;
  let langClass = '';
  
  // 语言名称映射（显示更友好的名称）
  const langNames = {
    'js': 'JavaScript',
    'javascript': 'JavaScript',
    'ts': 'TypeScript',
    'typescript': 'TypeScript',
    'py': 'Python',
    'python': 'Python',
    'rb': 'Ruby',
    'ruby': 'Ruby',
    'java': 'Java',
    'cpp': 'C++',
    'c': 'C',
    'cs': 'C#',
    'csharp': 'C#',
    'go': 'Go',
    'rust': 'Rust',
    'swift': 'Swift',
    'kotlin': 'Kotlin',
    'php': 'PHP',
    'html': 'HTML',
    'css': 'CSS',
    'scss': 'SCSS',
    'sass': 'Sass',
    'less': 'Less',
    'json': 'JSON',
    'xml': 'XML',
    'yaml': 'YAML',
    'yml': 'YAML',
    'md': 'Markdown',
    'markdown': 'Markdown',
    'sql': 'SQL',
    'bash': 'Bash',
    'sh': 'Shell',
    'shell': 'Shell',
    'powershell': 'PowerShell',
    'dockerfile': 'Dockerfile',
    'plaintext': 'Plain Text',
    'text': 'Plain Text'
  };
  
  const displayLang = lang ? (langNames[lang.toLowerCase()] || lang) : '';
  
  // HTML 转义函数
  const escape = (text) => {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };
  
  if (lang && typeof hljs !== 'undefined' && hljs.getLanguage(lang)) {
    try {
      highlightedCode = hljs.highlight(code, { language: lang }).value;
      langClass = 'language-' + lang;
    } catch (err) {
      highlightedCode = escape(code);
    }
  } else {
    highlightedCode = escape(code);
  }
  
  return '<div class="code-block-wrapper" data-lang="' + escape(lang) + '">' +
    '<div class="code-block-header">' +
      '<span class="code-lang-label" onclick="showLangSelector(this)" title="点击选择语言">' + (displayLang || '选择语言') + '</span>' +
      '<button class="code-copy-btn" onclick="copyCodeBlock(this)" title="复制代码">' +
        '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/></svg>' +
      '</button>' +
    '</div>' +
    '<pre class="' + langClass + '" contenteditable="false"><code class="' + langClass + '" contenteditable="true" spellcheck="false">' + highlightedCode + '</code></pre>' +
  '</div>';
};

// 复制代码块内容
window.copyCodeBlock = function(btn) {
  const wrapper = btn.closest('.code-block-wrapper');
  const code = wrapper.querySelector('code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/></svg>';
    setTimeout(() => {
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/></svg>';
    }, 2000);
  });
};

// 常用编程语言列表
const supportedLanguages = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'XML' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'shell', label: 'Shell' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'plaintext', label: 'Plain Text' }
];

// 显示语言选择器
window.showLangSelector = function(labelEl) {
  // 如果已有选择器，先移除
  const existingSelector = document.querySelector('.lang-selector-dropdown');
  if (existingSelector) {
    existingSelector.remove();
    return;
  }
  
  const wrapper = labelEl.closest('.code-block-wrapper');
  const currentLang = wrapper.dataset.lang || '';
  
  // 创建下拉选择器
  const dropdown = document.createElement('div');
  dropdown.className = 'lang-selector-dropdown';
  
  // 搜索输入框
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'lang-search-input';
  searchInput.placeholder = '搜索或输入语言...';
  searchInput.value = currentLang;
  dropdown.appendChild(searchInput);
  
  // 语言列表容器
  const listContainer = document.createElement('div');
  listContainer.className = 'lang-list-container';
  dropdown.appendChild(listContainer);
  
  // 渲染语言列表
  function renderList(filter = '') {
    listContainer.innerHTML = '';
    const filtered = supportedLanguages.filter(lang => 
      lang.label.toLowerCase().includes(filter.toLowerCase()) ||
      lang.value.toLowerCase().includes(filter.toLowerCase())
    );
    
    filtered.forEach(lang => {
      const item = document.createElement('div');
      item.className = 'lang-item' + (lang.value === currentLang ? ' selected' : '');
      item.textContent = lang.label;
      item.onclick = () => selectLanguage(lang.value, lang.label, wrapper, dropdown);
      listContainer.appendChild(item);
    });
    
    // 如果有自定义输入且不在列表中，显示"使用自定义"选项
    if (filter && !filtered.some(l => l.value === filter.toLowerCase())) {
      const customItem = document.createElement('div');
      customItem.className = 'lang-item custom-lang';
      customItem.textContent = `使用 "${filter}"`;
      customItem.onclick = () => selectLanguage(filter.toLowerCase(), filter, wrapper, dropdown);
      listContainer.appendChild(customItem);
    }
  }
  
  renderList();
  
  // 搜索过滤
  searchInput.oninput = () => renderList(searchInput.value);
  
  // 回车确认
  searchInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      const value = searchInput.value.trim().toLowerCase();
      const found = supportedLanguages.find(l => l.value === value || l.label.toLowerCase() === value);
      if (found) {
        selectLanguage(found.value, found.label, wrapper, dropdown);
      } else if (value) {
        selectLanguage(value, value, wrapper, dropdown);
      }
    } else if (e.key === 'Escape') {
      dropdown.remove();
    }
  };
  
  // 定位下拉框
  const rect = labelEl.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.left = rect.left + 'px';
  dropdown.style.top = (rect.bottom + 4) + 'px';
  
  document.body.appendChild(dropdown);
  searchInput.focus();
  searchInput.select();
  
  // 点击外部关闭
  setTimeout(() => {
    document.addEventListener('click', function closeDropdown(e) {
      if (!dropdown.contains(e.target) && e.target !== labelEl) {
        dropdown.remove();
        document.removeEventListener('click', closeDropdown);
      }
    });
  }, 0);
};

// 选择语言并更新代码块
function selectLanguage(langValue, langLabel, wrapper, dropdown) {
  dropdown.remove();
  
  // 更新 data-lang
  wrapper.dataset.lang = langValue;
  
  // 更新标签显示
  const label = wrapper.querySelector('.code-lang-label');
  label.textContent = langLabel || '选择语言';
  
  // 重新高亮代码
  const codeEl = wrapper.querySelector('code');
  const preEl = wrapper.querySelector('pre');
  const code = codeEl.textContent;
  
  // 更新 class
  preEl.className = langValue ? 'language-' + langValue : '';
  codeEl.className = langValue ? 'language-' + langValue : '';
  
  // 保持 contenteditable 属性
  preEl.setAttribute('contenteditable', 'false');
  codeEl.setAttribute('contenteditable', 'true');
  codeEl.setAttribute('spellcheck', 'false');
  
  // 重新高亮
  if (langValue && typeof hljs !== 'undefined' && hljs.getLanguage(langValue)) {
    try {
      codeEl.innerHTML = hljs.highlight(code, { language: langValue }).value;
    } catch (err) {
      // 高亮失败，保持原样
    }
  } else {
    // 无语言或不支持，显示纯文本
    codeEl.textContent = code;
  }
  
  // 如果在所见即所得模式，同步到源码
  if (currentEditMode === 'wysiwyg') {
    syncWysiwygToSource();
  }
}

// 配置 marked
marked.setOptions({
  renderer: renderer,
  breaks: true,
  gfm: true
});

// 视图模式: 'both', 'editor', 'preview'
let viewMode = 'both';

// 标记是否正在编辑表格（防止循环更新）
let isEditingTable = false;

// 标记是否正在从 WYSIWYG 同步到源码（防止循环更新）
let isSyncingFromWysiwyg = false;

// 标记是否正在同步滚动（防止循环触发）
let isSyncingScroll = false;

// 初始化
function init() {
  updatePreview();
  updateStats();
  updateView();
  updateEditMode();
  
  // CodeMirror 内容变化时更新预览和统计
  editor.on('change', () => {
    if (!isEditingTable && !isSyncingFromWysiwyg) {
      updatePreview();
    }
    updateStats();
    markModified();
  });
  
  // 初始化图片粘贴功能
  setupImagePaste();
  
  // 初始化同步滚动功能
  setupSyncScroll();
  
  // 模式切换按钮事件
  wysiwygModeBtn.addEventListener('click', () => switchEditMode('wysiwyg'));
  sourceModeBtn.addEventListener('click', () => switchEditMode('source'));
}

// 设置同步滚动功能
function setupSyncScroll() {
  // 获取 CodeMirror 的滚动容器
  const cmScroller = editor.getScrollerElement();
  
  // 编辑器滚动时同步预览区
  cmScroller.addEventListener('scroll', () => {
    if (isSyncingScroll || editMode === 'wysiwyg') return;
    
    isSyncingScroll = true;
    
    // 计算编辑器滚动百分比
    const scrollTop = cmScroller.scrollTop;
    const scrollHeight = cmScroller.scrollHeight - cmScroller.clientHeight;
    const scrollPercent = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
    
    // 同步预览区滚动
    const previewScrollHeight = preview.scrollHeight - preview.clientHeight;
    preview.scrollTop = scrollPercent * previewScrollHeight;
    
    // 重置标志，使用 requestAnimationFrame 避免循环
    requestAnimationFrame(() => {
      isSyncingScroll = false;
    });
  });
  
  // 预览区滚动时同步编辑器
  preview.addEventListener('scroll', () => {
    if (isSyncingScroll || editMode === 'wysiwyg') return;
    
    isSyncingScroll = true;
    
    // 计算预览区滚动百分比
    const scrollTop = preview.scrollTop;
    const scrollHeight = preview.scrollHeight - preview.clientHeight;
    const scrollPercent = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
    
    // 同步编辑器滚动
    const cmScrollHeight = cmScroller.scrollHeight - cmScroller.clientHeight;
    cmScroller.scrollTop = scrollPercent * cmScrollHeight;
    
    // 重置标志
    requestAnimationFrame(() => {
      isSyncingScroll = false;
    });
  });
}

// 切换编辑模式
function switchEditMode(mode) {
  if (editMode === mode) return;
  
  // 如果从 WYSIWYG 切换到源码，先同步内容
  if (editMode === 'wysiwyg' && mode === 'source') {
    syncWysiwygToSource();
  }
  
  editMode = mode;
  updateEditMode();
}

// 更新编辑模式 UI
function updateEditMode() {
  if (editMode === 'wysiwyg') {
    wysiwygModeBtn.classList.add('active');
    sourceModeBtn.classList.remove('active');
    document.body.classList.add('wysiwyg-mode');
    document.body.classList.remove('source-mode');
    
    // 隐藏源码编辑器，只显示预览区（但可编辑）
    editorPane.style.display = 'none';
    resizer.style.display = 'none';
    previewPane.style.flex = '1';
    
    // 让预览区可编辑
    previewContent.contentEditable = true;
    previewContent.classList.add('wysiwyg-editable');
    
    // 绑定 WYSIWYG 编辑事件
    setupWysiwygEditing();
  } else {
    wysiwygModeBtn.classList.remove('active');
    sourceModeBtn.classList.add('active');
    document.body.classList.remove('wysiwyg-mode');
    document.body.classList.add('source-mode');
    
    // 显示源码编辑器
    editorPane.style.display = 'flex';
    resizer.style.display = 'block';
    previewPane.style.flex = '';
    
    // 预览区不可编辑
    previewContent.contentEditable = false;
    previewContent.classList.remove('wysiwyg-editable');
    
    // 应用当前视图模式
    updateView();
  }
}

// WYSIWYG 事件监听器是否已绑定
let wysiwygEventsSetup = false;

// 设置 WYSIWYG 编辑功能
function setupWysiwygEditing() {
  // 避免重复绑定
  if (wysiwygEventsSetup) return;
  wysiwygEventsSetup = true;
  
  // 输入事件 - 实时同步到源码
  previewContent.addEventListener('input', debounce(() => {
    if (editMode === 'wysiwyg') {
      syncWysiwygToSource();
      markModified();
    }
  }, 100));
  
  // 为代码块添加专门的输入监听（因为 code 元素有自己的 contenteditable）
  // 注意：在 source 模式（双栏）下也需要同步
  previewContent.addEventListener('input', (e) => {
    if (e.target.closest('code[contenteditable="true"]')) {
      // 使用防抖同步
      clearTimeout(window._codeBlockSyncTimeout);
      window._codeBlockSyncTimeout = setTimeout(() => {
        syncWysiwygToSource();
        markModified();
      }, 100);
    }
  }, true); // 使用捕获阶段
  
  // 键盘快捷键
  previewContent.addEventListener('keydown', (e) => {
    // 检查是否在代码块内
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const anchorNode = selection.anchorNode;
    
    // 获取元素节点（如果是文本节点，取其父节点）
    let element = anchorNode;
    if (anchorNode && anchorNode.nodeType === Node.TEXT_NODE) {
      element = anchorNode.parentNode;
    }
    
    // 检查是否在代码块内（code 或 pre 元素内）
    const codeElement = element && element.closest('code');
    const preElement = element && element.closest('pre');
    const isInCodeBlock = codeElement || preElement;
    
    // 在代码块内按 Enter，插入换行符
    if (e.key === 'Enter' && !e.shiftKey && isInCodeBlock) {
      e.preventDefault();
      e.stopPropagation();
      
      // 在光标位置插入换行符
      const range = selection.getRangeAt(0);
      range.deleteContents();
      
      // 创建换行文本节点
      const newline = document.createTextNode('\n');
      range.insertNode(newline);
      
      // 将光标移动到换行符后面
      range.setStartAfter(newline);
      range.setEndAfter(newline);
      selection.removeAllRanges();
      selection.addRange(range);
      
      // 同步
      setTimeout(() => {
        syncWysiwygToSource();
        markModified();
      }, 10);
      return;
    }
    
    // 在代码块内按 Tab，插入空格
    if (e.key === 'Tab' && isInCodeBlock) {
      e.preventDefault();
      e.stopPropagation();
      
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const spaces = document.createTextNode('    ');
      range.insertNode(spaces);
      range.setStartAfter(spaces);
      range.setEndAfter(spaces);
      selection.removeAllRanges();
      selection.addRange(range);
      
      // 同步
      setTimeout(() => {
        syncWysiwygToSource();
        markModified();
      }, 10);
      return;
    }
    
    // 以下快捷键只在 wysiwyg 模式下生效
    if (editMode !== 'wysiwyg') return;
    
    // Cmd/Ctrl + B: 加粗
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      document.execCommand('bold');
    }
    // Cmd/Ctrl + I: 斜体
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
      e.preventDefault();
      document.execCommand('italic');
    }
    // Cmd/Ctrl + U: 下划线
    if ((e.metaKey || e.ctrlKey) && e.key === 'u') {
      e.preventDefault();
      document.execCommand('underline');
    }
  });
}

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// 从 WYSIWYG 同步到源码
function syncWysiwygToSource() {
  isSyncingFromWysiwyg = true;
  
  // 创建一个克隆来处理，避免影响原始 DOM
  const clone = previewContent.cloneNode(true);
  
  // 移除编辑辅助元素（如表格控制按钮）
  clone.querySelectorAll('.table-row-controls, .table-col-controls, .table-context-menu, .col-resizer, .image-resize-handle').forEach(el => el.remove());
  
  // 还原表格包装器
  clone.querySelectorAll('.table-editor-wrapper').forEach(wrapper => {
    const table = wrapper.querySelector('table');
    if (table) {
      wrapper.parentNode.insertBefore(table.cloneNode(true), wrapper);
      wrapper.remove();
    }
  });
  
  // 还原图片包装器
  clone.querySelectorAll('.image-container').forEach(container => {
    const img = container.querySelector('img');
    if (img) {
      container.parentNode.insertBefore(img.cloneNode(true), container);
      container.remove();
    }
  });
  
  // 转换为 Markdown
  let markdown = turndownService.turndown(clone.innerHTML);
  
  // 处理文件路径
  if (currentDocPath) {
    const baseDir = currentDocPath.substring(0, currentDocPath.lastIndexOf('/'));
    // 将 file:// 路径还原为相对路径
    markdown = markdown.replace(new RegExp(`file://${baseDir}/`, 'g'), '');
  }
  
  // 更新编辑器内容
  const cursor = editor.getCursor();
  editor.setValue(markdown);
  editor.setCursor(cursor);
  
  isSyncingFromWysiwyg = false;
  updateStats();
}

// 更新预览
function updatePreview() {
  const markdown = editor.getValue();
  let html = marked.parse(markdown);
  
  // 处理相对路径的图片，转换为 file:// 协议
  // 注意保留 ?w= 参数用于渲染器识别宽度
  if (currentDocPath) {
    const baseDir = currentDocPath.substring(0, currentDocPath.lastIndexOf('/'));
    html = html.replace(/src="(?!http|file:|data:)([^"?]+)(\?[^"]*)?"/g, (match, path, query) => {
      return `src="file://${baseDir}/${path}${query || ''}"`;
    });
  }
  
  previewContent.innerHTML = html;
  
  // 为所有图片添加可调整大小的功能
  setupResizableImages();
  
  // 为所有表格添加可编辑功能
  setupEditableTables();
}

// 设置表格可编辑（Typora 风格）
function setupEditableTables() {
  const tables = previewContent.querySelectorAll('table');
  
  tables.forEach((table, tableIndex) => {
    // 如果已经处理过就跳过
    if (table.parentElement.classList.contains('table-editor-wrapper')) return;
    
    // 创建包装容器
    const wrapper = document.createElement('div');
    wrapper.className = 'table-editor-wrapper';
    wrapper.dataset.tableIndex = tableIndex;
    
    // 插入包装器
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
    
    // 记录当前选中的单元格
    let currentCell = null;
    let currentRow = 0;
    let currentCol = 0;
    
    // 创建行操作按钮容器（左侧）
    const rowControls = document.createElement('div');
    rowControls.className = 'table-row-controls';
    wrapper.appendChild(rowControls);
    
    // 创建列操作按钮容器（顶部）
    const colControls = document.createElement('div');
    colControls.className = 'table-col-controls';
    wrapper.appendChild(colControls);
    
    // 更新控制按钮位置
    function updateControls() {
      const rows = table.querySelectorAll('tr');
      const cols = rows[0] ? rows[0].cells.length : 0;
      
      // 清空现有按钮
      rowControls.innerHTML = '';
      colControls.innerHTML = '';
      
      // 添加列控制按钮（+ 号）
      for (let i = 0; i <= cols; i++) {
        const btn = document.createElement('button');
        btn.className = 'table-add-btn col-add-btn';
        btn.innerHTML = '+';
        btn.title = '插入列';
        btn.dataset.colIndex = i;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (i === 0) {
            addTableCol(table, 0, 'left');
          } else {
            addTableCol(table, i - 1, 'right');
          }
          syncTableToMarkdown(table, tableIndex);
          rebuildTable();
        });
        colControls.appendChild(btn);
      }
      
      // 添加行控制按钮（+ 号）
      const tbody = table.querySelector('tbody');
      const dataRows = tbody ? tbody.rows.length : rows.length - 1;
      for (let i = 0; i <= dataRows; i++) {
        const btn = document.createElement('button');
        btn.className = 'table-add-btn row-add-btn';
        btn.innerHTML = '+';
        btn.title = '插入行';
        btn.dataset.rowIndex = i;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const thead = table.querySelector('thead');
          const offset = thead ? thead.rows.length : 1;
          if (i === 0) {
            addTableRow(table, offset, 'above');
          } else {
            addTableRow(table, offset + i - 1, 'below');
          }
          syncTableToMarkdown(table, tableIndex);
          rebuildTable();
        });
        rowControls.appendChild(btn);
      }
      
      // 定位控制按钮
      positionControls();
    }
    
    // 定位控制按钮
    function positionControls() {
      const tableRect = table.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      
      // 列按钮定位
      const colBtns = colControls.querySelectorAll('.col-add-btn');
      const headerCells = table.querySelectorAll('thead th, tr:first-child th, tr:first-child td');
      let colX = 0;
      
      colBtns.forEach((btn, i) => {
        if (i === 0) {
          btn.style.left = '-4px';
        } else if (headerCells[i - 1]) {
          colX += headerCells[i - 1].offsetWidth;
          btn.style.left = (colX - 4) + 'px';
        }
      });
      
      // 行按钮定位
      const rowBtns = rowControls.querySelectorAll('.row-add-btn');
      const tbody = table.querySelector('tbody');
      const dataRows = tbody ? Array.from(tbody.rows) : Array.from(table.rows).slice(1);
      let rowY = table.querySelector('thead')?.offsetHeight || table.rows[0]?.offsetHeight || 0;
      
      rowBtns.forEach((btn, i) => {
        if (i === 0) {
          btn.style.top = (rowY - 4) + 'px';
        } else if (dataRows[i - 1]) {
          rowY += dataRows[i - 1].offsetHeight;
          btn.style.top = (rowY - 4) + 'px';
        }
      });
    }
    
    // 重建表格（刷新后重新绑定事件）
    function rebuildTable() {
      // 移除旧的包装器
      const parent = wrapper.parentNode;
      parent.insertBefore(table, wrapper);
      wrapper.remove();
      // 重新设置
      setupEditableTables();
    }
    
    // 使所有单元格可编辑
    const cells = table.querySelectorAll('th, td');
    cells.forEach((cell, cellIndex) => {
      cell.contentEditable = true;
      cell.dataset.cellIndex = cellIndex;
      
      // 单元格获得焦点时记录位置
      cell.addEventListener('focus', () => {
        currentCell = cell;
        const row = cell.parentElement;
        currentRow = Array.from(row.parentElement.children).indexOf(row);
        currentCol = Array.from(row.children).indexOf(cell);
        
        // 如果在 tbody 中，需要加上 thead 的行数
        if (row.parentElement.tagName === 'TBODY') {
          const thead = table.querySelector('thead');
          if (thead) {
            currentRow += thead.rows.length;
          }
        }
        
        // 高亮当前单元格
        cells.forEach(c => c.classList.remove('cell-active'));
        cell.classList.add('cell-active');
        
        // 高亮当前行和列
        table.querySelectorAll('.row-highlight, .col-highlight').forEach(el => {
          el.classList.remove('row-highlight', 'col-highlight');
        });
        row.classList.add('row-highlight');
        table.querySelectorAll('tr').forEach(r => {
          if (r.cells[currentCol]) {
            r.cells[currentCol].classList.add('col-highlight');
          }
        });
      });
      
      // 单元格失去焦点
      cell.addEventListener('blur', () => {
        setTimeout(() => {
          if (!table.contains(document.activeElement)) {
            table.querySelectorAll('.row-highlight, .col-highlight').forEach(el => {
              el.classList.remove('row-highlight', 'col-highlight');
            });
          }
        }, 100);
      });
      
      // 单元格内容变化时更新 Markdown
      cell.addEventListener('input', () => {
        syncTableToMarkdown(table, tableIndex);
      });
      
      // 处理键盘事件
      cell.addEventListener('keydown', (e) => {
        const allCells = Array.from(table.querySelectorAll('th, td'));
        const currentIndex = allCells.indexOf(cell);
        
        if (e.key === 'Tab') {
          e.preventDefault();
          const nextIndex = e.shiftKey ? currentIndex - 1 : currentIndex + 1;
          
          if (nextIndex >= 0 && nextIndex < allCells.length) {
            allCells[nextIndex].focus();
          } else if (!e.shiftKey && nextIndex >= allCells.length) {
            // Typora 风格：最后一格按 Tab 自动添加新行
            const thead = table.querySelector('thead');
            const lastRowIndex = (thead ? thead.rows.length : 1) + (table.querySelector('tbody')?.rows.length || table.rows.length - 1) - 1;
            addTableRow(table, lastRowIndex, 'below');
            syncTableToMarkdown(table, tableIndex);
            rebuildTable();
            // 延迟聚焦新行第一格
            setTimeout(() => {
              const newCells = previewContent.querySelectorAll('table')[tableIndex]?.querySelectorAll('td');
              if (newCells && newCells.length > 0) {
                newCells[newCells.length - table.rows[0].cells.length]?.focus();
              }
            }, 50);
          }
        } else if (e.key === 'Enter' && !e.shiftKey) {
          // Enter 键移到下一行同列
          e.preventDefault();
          const colsPerRow = table.rows[0].cells.length;
          const nextRowIndex = currentIndex + colsPerRow;
          if (nextRowIndex < allCells.length) {
            allCells[nextRowIndex].focus();
          }
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          // 仅在光标在单元格边缘时才移动
          const sel = window.getSelection();
          const isAtStart = sel.anchorOffset === 0;
          const isAtEnd = sel.anchorOffset === cell.textContent.length;
          
          if (e.key === 'ArrowUp' && isAtStart) {
            e.preventDefault();
            const colsPerRow = table.rows[0].cells.length;
            const prevRowIndex = currentIndex - colsPerRow;
            if (prevRowIndex >= 0) allCells[prevRowIndex].focus();
          } else if (e.key === 'ArrowDown' && isAtEnd) {
            e.preventDefault();
            const colsPerRow = table.rows[0].cells.length;
            const nextRowIndex = currentIndex + colsPerRow;
            if (nextRowIndex < allCells.length) allCells[nextRowIndex].focus();
          } else if (e.key === 'ArrowLeft' && isAtStart && currentIndex > 0) {
            e.preventDefault();
            allCells[currentIndex - 1].focus();
          } else if (e.key === 'ArrowRight' && isAtEnd && currentIndex < allCells.length - 1) {
            e.preventDefault();
            allCells[currentIndex + 1].focus();
          }
        }
      });
    });
    
    // 右键菜单
    table.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showTableContextMenu(e, table, tableIndex, currentRow, currentCol, rebuildTable);
    });
    
    // 初始化控制按钮
    updateControls();
    
    // 添加列宽拖动功能
    setupColumnResize(table);
  });
}

// 显示表格右键菜单
function showTableContextMenu(e, table, tableIndex, currentRow, currentCol, rebuildTable) {
  // 移除已有菜单
  document.querySelectorAll('.table-context-menu').forEach(m => m.remove());
  
  const menu = document.createElement('div');
  menu.className = 'table-context-menu';
  menu.innerHTML = `
    <div class="menu-item" data-action="addRowAbove">在上方插入行</div>
    <div class="menu-item" data-action="addRowBelow">在下方插入行</div>
    <div class="menu-divider"></div>
    <div class="menu-item" data-action="addColLeft">在左侧插入列</div>
    <div class="menu-item" data-action="addColRight">在右侧插入列</div>
    <div class="menu-divider"></div>
    <div class="menu-item danger" data-action="deleteRow">删除当前行</div>
    <div class="menu-item danger" data-action="deleteCol">删除当前列</div>
  `;
  
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  document.body.appendChild(menu);
  
  // 处理菜单点击
  menu.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      switch(action) {
        case 'addRowAbove':
          addTableRow(table, currentRow, 'above');
          break;
        case 'addRowBelow':
          addTableRow(table, currentRow, 'below');
          break;
        case 'addColLeft':
          addTableCol(table, currentCol, 'left');
          break;
        case 'addColRight':
          addTableCol(table, currentCol, 'right');
          break;
        case 'deleteRow':
          deleteTableRow(table, currentRow);
          break;
        case 'deleteCol':
          deleteTableCol(table, currentCol);
          break;
      }
      syncTableToMarkdown(table, tableIndex);
      rebuildTable();
      menu.remove();
    });
  });
  
  // 点击其他地方关闭菜单
  setTimeout(() => {
    document.addEventListener('click', function closeMenu() {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    });
  }, 0);
}

// 添加表格行
function addTableRow(table, rowIndex, position) {
  const tbody = table.querySelector('tbody') || table;
  const thead = table.querySelector('thead');
  const colCount = table.querySelector('tr').cells.length;
  
  // 创建新行
  const newRow = document.createElement('tr');
  for (let i = 0; i < colCount; i++) {
    const cell = document.createElement('td');
    cell.textContent = '';
    cell.contentEditable = true;
    newRow.appendChild(cell);
  }
  
  // 计算实际插入位置
  let targetRow;
  let actualIndex = rowIndex;
  
  if (thead && rowIndex < thead.rows.length) {
    // 在表头区域，插入到表头
    targetRow = thead.rows[rowIndex];
    if (position === 'above') {
      thead.insertBefore(newRow, targetRow);
    } else {
      thead.insertBefore(newRow, targetRow.nextSibling);
    }
  } else {
    // 在表体区域
    if (thead) {
      actualIndex = rowIndex - thead.rows.length;
    }
    targetRow = tbody.rows[actualIndex];
    if (targetRow) {
      if (position === 'above') {
        tbody.insertBefore(newRow, targetRow);
      } else {
        tbody.insertBefore(newRow, targetRow.nextSibling);
      }
    } else {
      tbody.appendChild(newRow);
    }
  }
}

// 删除表格行
function deleteTableRow(table, rowIndex) {
  const tbody = table.querySelector('tbody') || table;
  const thead = table.querySelector('thead');
  
  // 至少保留表头和一行数据
  const totalRows = (thead ? thead.rows.length : 0) + tbody.rows.length;
  if (totalRows <= 2) return;
  
  if (thead && rowIndex < thead.rows.length) {
    // 不允许删除表头
    return;
  }
  
  let actualIndex = rowIndex;
  if (thead) {
    actualIndex = rowIndex - thead.rows.length;
  }
  
  if (tbody.rows[actualIndex]) {
    tbody.deleteRow(actualIndex);
  }
}

// 添加表格列
function addTableCol(table, colIndex, position) {
  const rows = table.querySelectorAll('tr');
  const insertIndex = position === 'left' ? colIndex : colIndex + 1;
  
  rows.forEach((row, rowIdx) => {
    const isHeader = row.parentElement.tagName === 'THEAD' || rowIdx === 0;
    const cell = document.createElement(isHeader ? 'th' : 'td');
    cell.textContent = '';
    cell.contentEditable = true;
    
    if (row.cells[insertIndex]) {
      row.insertBefore(cell, row.cells[insertIndex]);
    } else {
      row.appendChild(cell);
    }
  });
}

// 删除表格列
function deleteTableCol(table, colIndex) {
  const rows = table.querySelectorAll('tr');
  const colCount = rows[0].cells.length;
  
  // 至少保留一列
  if (colCount <= 1) return;
  
  rows.forEach(row => {
    if (row.cells[colIndex]) {
      row.deleteCell(colIndex);
    }
  });
}

// 设置列宽拖动
function setupColumnResize(table) {
  const headerCells = table.querySelectorAll('th');
  
  headerCells.forEach((cell, index) => {
    // 创建拖动手柄
    const resizer = document.createElement('div');
    resizer.className = 'col-resizer';
    cell.style.position = 'relative';
    cell.appendChild(resizer);
    
    let startX, startWidth;
    
    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
      startWidth = cell.offsetWidth;
      
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      const onMouseMove = (e) => {
        const width = Math.max(50, startWidth + e.clientX - startX);
        cell.style.width = width + 'px';
        cell.style.minWidth = width + 'px';
        
        // 同时设置该列所有单元格的宽度
        const colIndex = Array.from(cell.parentElement.cells).indexOf(cell);
        table.querySelectorAll('tr').forEach(row => {
          if (row.cells[colIndex]) {
            row.cells[colIndex].style.width = width + 'px';
            row.cells[colIndex].style.minWidth = width + 'px';
          }
        });
      };
      
      const onMouseUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
  
  // 设置行高拖动
  setupRowResize(table);
}

// 设置行高拖动
function setupRowResize(table) {
  const rows = table.querySelectorAll('tr');
  
  rows.forEach((row, rowIndex) => {
    // 跳过第一行（表头）
    if (rowIndex === 0) return;
    
    // 在第一个单元格上创建行高拖动手柄
    const firstCell = row.cells[0];
    if (!firstCell) return;
    
    firstCell.style.position = 'relative';
    
    const resizer = document.createElement('div');
    resizer.className = 'row-resizer';
    firstCell.appendChild(resizer);
    
    let startY, startHeight;
    
    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startY = e.clientY;
      startHeight = row.offsetHeight;
      
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      
      const onMouseMove = (e) => {
        const height = Math.max(30, startHeight + e.clientY - startY);
        row.style.height = height + 'px';
        // 设置该行所有单元格的高度
        Array.from(row.cells).forEach(cell => {
          cell.style.height = height + 'px';
        });
      };
      
      const onMouseUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
}

// 同步表格到 Markdown
function syncTableToMarkdown(table, tableIndex) {
  isEditingTable = true;
  
  const markdown = editor.getValue();
  const lines = markdown.split('\n');
  
  // 找到第 tableIndex 个表格的位置
  let tableCount = -1;
  let tableStartLine = -1;
  let tableEndLine = -1;
  let inTable = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isTableLine = line.startsWith('|') && line.endsWith('|');
    
    if (isTableLine && !inTable) {
      tableCount++;
      if (tableCount === tableIndex) {
        tableStartLine = i;
        inTable = true;
      }
    } else if (!isTableLine && inTable) {
      tableEndLine = i;
      break;
    }
  }
  
  if (tableEndLine === -1 && inTable) {
    tableEndLine = lines.length;
  }
  
  if (tableStartLine === -1) {
    isEditingTable = false;
    return;
  }
  
  // 从 HTML 表格生成 Markdown
  const newTableLines = [];
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  
  // 处理表头
  if (thead) {
    const headerRow = thead.querySelector('tr');
    if (headerRow) {
      const headerCells = Array.from(headerRow.cells).map(c => c.textContent.trim() || ' ');
      newTableLines.push('| ' + headerCells.join(' | ') + ' |');
      newTableLines.push('| ' + headerCells.map(() => '---').join(' | ') + ' |');
    }
  }
  
  // 处理表体
  if (tbody) {
    Array.from(tbody.rows).forEach(row => {
      const cells = Array.from(row.cells).map(c => c.textContent.trim() || ' ');
      newTableLines.push('| ' + cells.join(' | ') + ' |');
    });
  }
  
  // 替换原来的表格
  const newLines = [
    ...lines.slice(0, tableStartLine),
    ...newTableLines,
    ...lines.slice(tableEndLine)
  ];
  
  const cursor = editor.getCursor();
  editor.setValue(newLines.join('\n'));
  editor.setCursor(cursor);
  
  setTimeout(() => {
    isEditingTable = false;
  }, 100);
}

// 设置图片可调整大小
function setupResizableImages() {
  const images = previewContent.querySelectorAll('img');
  
  images.forEach((img, index) => {
    // 如果已经包装过就跳过
    if (img.parentElement.classList.contains('image-resizer-wrapper')) return;
    
    // 创建包装容器
    const wrapper = document.createElement('div');
    wrapper.className = 'image-resizer-wrapper';
    wrapper.dataset.imageIndex = index;
    
    // 保存原始图片信息用于后续更新 Markdown
    const originalSrc = img.getAttribute('src');
    wrapper.dataset.originalSrc = originalSrc;
    
    // 插入包装器
    img.parentNode.insertBefore(wrapper, img);
    wrapper.appendChild(img);
    
    // 创建调整手柄
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'image-resize-handle';
    wrapper.appendChild(resizeHandle);
    
    // 添加尺寸显示标签
    const sizeLabel = document.createElement('div');
    sizeLabel.className = 'image-size-label';
    wrapper.appendChild(sizeLabel);
    
    // 当图片加载完成后设置初始尺寸
    if (img.complete) {
      initImageSize(img, wrapper, sizeLabel);
    } else {
      img.onload = () => initImageSize(img, wrapper, sizeLabel);
    }
    
    // 拖拽调整大小逻辑
    let isResizingImage = false;
    let startX, startY, startWidth, startHeight;
    
    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isResizingImage = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = img.offsetWidth;
      startHeight = img.offsetHeight;
      
      wrapper.classList.add('resizing');
      sizeLabel.style.display = 'block';
      updateSizeLabel(sizeLabel, img.offsetWidth, img.offsetHeight);
      
      document.body.style.cursor = 'nwse-resize';
      document.body.style.userSelect = 'none';
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isResizingImage) return;
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      // 保持宽高比
      const aspectRatio = startWidth / startHeight;
      let newWidth = Math.max(50, startWidth + dx);
      let newHeight = newWidth / aspectRatio;
      
      // 也可以基于 dy 来调整
      if (Math.abs(dy) > Math.abs(dx)) {
        newHeight = Math.max(50, startHeight + dy);
        newWidth = newHeight * aspectRatio;
      }
      
      img.style.width = newWidth + 'px';
      img.style.height = 'auto';
      
      updateSizeLabel(sizeLabel, Math.round(newWidth), Math.round(newWidth / aspectRatio));
    });
    
    document.addEventListener('mouseup', (e) => {
      if (!isResizingImage) return;
      isResizingImage = false;
      
      wrapper.classList.remove('resizing');
      sizeLabel.style.display = 'none';
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      // 更新 Markdown 中的图片大小
      const newWidth = Math.round(img.offsetWidth);
      updateImageSizeInMarkdown(originalSrc, newWidth);
    });
  });
}

// 初始化图片尺寸
function initImageSize(img, wrapper, sizeLabel) {
  // 检查 Markdown 中是否已有指定宽度
  const markdown = editor.getValue();
  const originalSrc = wrapper.dataset.originalSrc;
  
  // 提取图片路径（去掉 file:// 前缀和查询参数）
  let imgPath = originalSrc;
  if (originalSrc.startsWith('file://')) {
    imgPath = originalSrc.replace('file://', '');
    if (currentDocPath) {
      const baseDir = currentDocPath.substring(0, currentDocPath.lastIndexOf('/'));
      imgPath = imgPath.replace(baseDir + '/', '');
    }
  }
  // 去掉可能的查询参数
  imgPath = imgPath.split('?')[0];
  
  // 查找带有宽度的图片语法: ![alt](src?w=width)
  const escapedPath = imgPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sizeRegex = new RegExp(`!\\[[^\\]]*\\]\\(${escapedPath}\\?w=(\\d+)\\)`, 'i');
  const match = markdown.match(sizeRegex);
  
  if (match && match[1]) {
    img.style.width = match[1] + 'px';
    img.style.height = 'auto';
  }
}

// 更新尺寸标签
function updateSizeLabel(label, width, height) {
  label.textContent = `${Math.round(width)} × ${Math.round(height)}`;
}

// 更新 Markdown 中的图片尺寸
function updateImageSizeInMarkdown(originalSrc, newWidth) {
  const markdown = editor.getValue();
  
  // 提取图片路径
  let imgPath = originalSrc;
  if (originalSrc.startsWith('file://')) {
    imgPath = originalSrc.replace('file://', '');
    if (currentDocPath) {
      const baseDir = currentDocPath.substring(0, currentDocPath.lastIndexOf('/'));
      imgPath = imgPath.replace(baseDir + '/', '');
    }
  }
  // 去掉可能的查询参数
  imgPath = imgPath.split('?')[0];
  
  // 转义特殊字符用于正则
  const escapedPath = imgPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // 匹配图片语法，支持可选的尺寸参数
  // 格式: ![alt](path) 或 ![alt](path?w=width)
  const imgRegex = new RegExp(`(!\\[[^\\]]*\\]\\()(${escapedPath})(?:\\?w=\\d+)?(\\))`, 'gi');
  
  const newMarkdown = markdown.replace(imgRegex, (match, prefix, path, suffix) => {
    return `${prefix}${path}?w=${newWidth}${suffix}`;
  });
  
  if (newMarkdown !== markdown) {
    // 保存光标位置
    const cursor = editor.getCursor();
    editor.setValue(newMarkdown);
    editor.setCursor(cursor);
  }
}

// 更新统计信息
function updateStats() {
  const text = editor.getValue();
  const lines = editor.lineCount();
  const chars = text.length;
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  
  lineCount.textContent = `行: ${lines}`;
  wordCount.textContent = `字数: ${words}`;
  charCount.textContent = `字符: ${chars}`;
}

// 标记文件已修改
let isModified = false;
function markModified() {
  if (!isModified) {
    isModified = true;
    fileModified.textContent = '•';
  }
}

function clearModified() {
  isModified = false;
  fileModified.textContent = '';
}

// 更新视图
function updateView() {
  switch(viewMode) {
    case 'both':
      editorPane.style.display = 'flex';
      previewPane.style.display = 'flex';
      resizer.style.display = 'block';
      editorPane.style.flex = '1';
      previewPane.style.flex = '1';
      editorPane.style.width = '';
      previewPane.style.width = '';
      break;
    case 'editor':
      editorPane.style.display = 'flex';
      previewPane.style.display = 'none';
      resizer.style.display = 'none';
      editorPane.style.flex = '1';
      editorPane.style.width = '100%';
      break;
    case 'preview':
      editorPane.style.display = 'none';
      previewPane.style.display = 'flex';
      resizer.style.display = 'none';
      previewPane.style.flex = '1';
      previewPane.style.width = '100%';
      break;
  }
  editor.refresh(); // 刷新 CodeMirror 以适应大小变化
}

// 切换视图
function toggleView() {
  if (viewMode === 'both') {
    viewMode = 'preview';
  } else if (viewMode === 'preview') {
    viewMode = 'editor';
  } else {
    viewMode = 'both';
  }
  updateView();
}

// 新建文件
function newFile() {
  if (isModified && !confirm('当前文件未保存，确定要新建吗？')) {
    return;
  }
  editor.setValue('');
  fileName.textContent = '未命名.md';
  clearModified();
  updatePreview();
  updateStats();
  setStatus('新建文件');
}

// 打印功能
function printDocument() {
  // 将预览内容复制到打印区域
  printArea.innerHTML = previewContent.innerHTML;
  printArea.style.display = 'block';
  
  // 创建打印样式
  const printStyles = `
    <style>
      @media print {
        body * {
          visibility: hidden;
        }
        #printArea, #printArea * {
          visibility: visible;
        }
        #printArea {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          display: block !important;
          padding: 20px;
        }
        #printArea h1, #printArea h2, #printArea h3 {
          page-break-after: avoid;
        }
        #printArea pre {
          page-break-inside: avoid;
        }
      }
    </style>
  `;
  
  // 添加打印样式
  const styleElement = document.createElement('div');
  styleElement.innerHTML = printStyles;
  document.head.appendChild(styleElement);
  
  // 执行打印
  window.print();
  
  // 打印后清理
  setTimeout(() => {
    printArea.style.display = 'none';
    printArea.innerHTML = '';
    document.head.removeChild(styleElement);
  }, 100);
  
  setStatus('已发送到打印机');
}

// 设置状态
function setStatus(msg) {
  status.textContent = msg;
  setTimeout(() => {
    status.textContent = '就绪';
  }, 3000);
}

// 按钮事件已移至模式切换按钮

// IPC 通信事件
ipcRenderer.on('new-file', () => {
  newFile();
});

ipcRenderer.on('toggle-preview', () => {
  toggleView();
});

ipcRenderer.on('print-request', () => {
  printDocument();
});

ipcRenderer.on('file-opened', (event, content, filePath) => {
  editor.setValue(content);
  fileName.textContent = filePath.split('/').pop();
  clearModified();
  updatePreview();
  updateStats();
  setStatus('文件已打开');
  currentDocPath = filePath;
});

ipcRenderer.on('save-file', (event, filePath) => {
  ipcRenderer.send('write-file', filePath, editor.getValue());
});

ipcRenderer.on('file-saved', (event, filePath) => {
  fileName.textContent = filePath.split('/').pop();
  clearModified();
  setStatus('文件已保存');
});

// 初始化应用
init();

// 示例内容
if (editor.getValue() === '') {
  editor.setValue(`# 欢迎使用 Easy Markdown 编辑器

这是一个简洁易用的 Markdown 编辑器，专为 macOS 设计。

## 主要特性

- ✨ **实时预览**：编辑时即时查看渲染效果
- 📝 **语法高亮**：支持多种编程语言的代码高亮
- 🖨️ **打印支持**：轻松打印你的 Markdown 文档
- ⚡ **快捷键**：提升编辑效率

## 快捷键

- \`Cmd+N\` - 新建文件
- \`Cmd+O\` - 打开文件
- \`Cmd+S\` - 保存文件
- \`Cmd+P\` - 打印文档
- \`Cmd+E\` - 切换预览模式

## Markdown 示例

### 代码块

\`\`\`javascript
function hello() {
    console.log("Hello, Markdown!");
}
\`\`\`

### 列表

1. 第一项
2. 第二项
3. 第三项

### 表格

| 功能 | 描述 |
|------|------|
| 编辑 | 实时编辑 Markdown |
| 预览 | 即时查看渲染效果 |
| 打印 | 支持打印输出 |

### 引用

> 这是一个引用示例

现在开始你的创作吧！`);
  updatePreview();
  updateStats();
  clearModified();
}

// ========== 设置功能 ==========

// 打开设置弹窗的函数
async function openSettings() {
  try {
    // 加载当前设置
    const settings = await ipcRenderer.invoke('get-settings');
    imageStorageType.value = settings.imageStorageType || 'local';
    imgbedType.value = settings.imgbedType || 'smms';
    imgbedToken.value = settings.imgbedToken || '';
    imgbedCustomUrl.value = settings.imgbedCustomUrl || '';
    
    // 显示/隐藏图床设置
    imgbedSettings.style.display = settings.imageStorageType === 'imgbed' ? 'block' : 'none';
    customUrlSetting.style.display = settings.imgbedType === 'custom' ? 'block' : 'none';
    
    settingsModal.classList.add('show');
  } catch (err) {
    console.error('打开设置失败:', err);
  }
}

// 监听菜单栏的设置命令
ipcRenderer.on('open-settings', () => {
  openSettings();
});

// 点击设置按钮打开设置弹窗
if (settingsBtn) {
  settingsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openSettings();
  });
}

// 关闭设置弹窗
if (closeSettings) {
  closeSettings.addEventListener('click', () => {
    settingsModal.classList.remove('show');
  });
}

// 点击遮罩关闭
if (settingsModal) {
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.remove('show');
    }
  });
}

// 图片存储类型切换
if (imageStorageType) {
  imageStorageType.addEventListener('change', () => {
    imgbedSettings.style.display = imageStorageType.value === 'imgbed' ? 'block' : 'none';
  });
}

// 图床类型切换
if (imgbedType) {
  imgbedType.addEventListener('change', () => {
    customUrlSetting.style.display = imgbedType.value === 'custom' ? 'block' : 'none';
  });
}

// 保存设置
if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener('click', () => {
    const newSettings = {
      imageStorageType: imageStorageType.value,
      imgbedType: imgbedType.value,
      imgbedToken: imgbedToken.value,
      imgbedCustomUrl: imgbedCustomUrl.value
    };
    ipcRenderer.send('save-settings', newSettings);
    settingsModal.classList.remove('show');
    setStatus('设置已保存');
  });
}

// ========== 图片粘贴功能 ==========

// 设置图片粘贴功能
function setupImagePaste() {
  // 在 document 级别监听粘贴事件
  document.addEventListener('paste', async (e) => {
    // 检查焦点是否在编辑器中
    if (!editor.hasFocus()) return;
    
    const clipboardData = e.clipboardData;
    if (!clipboardData) {
      console.log('No clipboardData');
      return;
    }
    
    const items = clipboardData.items;
    if (!items || items.length === 0) {
      console.log('No items in clipboard');
      return;
    }
    
    console.log('Clipboard items:', items.length);
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log('Item type:', item.type);
      
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        e.stopPropagation();
        
        const file = item.getAsFile();
        if (!file) {
          console.log('Could not get file from item');
          continue;
        }
        
        console.log('Got image file:', file.name, file.size);
        setStatus('正在处理图片...');
        
        try {
          // 将图片转为 base64
          const dataUrl = await fileToDataUrl(file);
          console.log('Converted to dataUrl, length:', dataUrl.length);
          
          // 获取设置
          const settings = await ipcRenderer.invoke('get-settings');
          console.log('Settings:', settings.imageStorageType);
          
          let imageUrl;
          
          if (settings.imageStorageType === 'local') {
            // 保存到本地
            const docPath = await ipcRenderer.invoke('get-current-file-path');
            console.log('Doc path:', docPath);
          const result = await ipcRenderer.invoke('save-pasted-image', dataUrl, docPath);
          console.log('Saved image:', result);
          imageUrl = result.relativePath;
          if (docPath) {
            currentDocPath = docPath;
          }
          } else {
            // 上传到图床
            if (!settings.imgbedToken) {
              setStatus('请先在设置中配置图床 Token');
              return;
            }
            imageUrl = await ipcRenderer.invoke('upload-to-imgbed', dataUrl);
          }
          
          // 插入 Markdown 图片语法
          const markdownImage = `![image](${imageUrl})`;
          editor.replaceSelection(markdownImage);
          setStatus('图片已插入');
          markModified();
          updatePreview();
          
        } catch (err) {
          console.error('处理图片失败:', err);
          setStatus('图片处理失败: ' + err.message);
        }
        
        return;
      }
    }
  }, true); // 使用捕获阶段
}

// 文件转 DataURL
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 更新当前文件路径（文件打开时）
ipcRenderer.on('file-opened', (event, content, filePath) => {
  currentDocPath = filePath;
});

// 更新当前文件路径（文件保存时）
ipcRenderer.on('file-saved', (event, filePath) => {
  currentDocPath = filePath;
});
