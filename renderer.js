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
const toggleBtn = document.getElementById('toggleBtn');
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

// 绑定格式按钮事件
document.querySelectorAll('.format-btn[data-format]').forEach(btn => {
  btn.addEventListener('click', () => {
    const format = btn.dataset.format;
    if (formatActions[format]) {
      formatActions[format]();
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
    if (formatActions[format]) {
      formatActions[format]();
    }
    headingMenu.classList.remove('show');
  });
});

// 点击其他地方关闭下拉菜单
document.addEventListener('click', () => {
  headingMenu.classList.remove('show');
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey) {
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

// 配置 marked
marked.setOptions({
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (err) {}
    }
    return code;
  },
  breaks: true,
  gfm: true
});

// 视图模式: 'both', 'editor', 'preview'
let viewMode = 'both';

// 初始化
function init() {
  updatePreview();
  updateStats();
  updateView();
  
  // CodeMirror 内容变化时更新预览和统计
  editor.on('change', () => {
    updatePreview();
    updateStats();
    markModified();
  });
  
  // 初始化图片粘贴功能
  setupImagePaste();
}

// 更新预览
function updatePreview() {
  const markdown = editor.getValue();
  let html = marked.parse(markdown);
  
  // 处理相对路径的图片，转换为 file:// 协议
  if (currentDocPath) {
    const baseDir = currentDocPath.substring(0, currentDocPath.lastIndexOf('/'));
    html = html.replace(/src="(?!http|file:|data:)([^"]+)"/g, (match, p1) => {
      return `src="file://${baseDir}/${p1}"`;
    });
  }
  
  previewContent.innerHTML = html;
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
      toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="2" y="3" width="8" height="18" rx="1" fill="currentColor"/><rect x="14" y="3" width="8" height="18" rx="1" fill="currentColor" opacity="0.4"/></svg>';
      toggleBtn.title = '当前：编辑+预览 (Cmd+E)';
      break;
    case 'editor':
      editorPane.style.display = 'flex';
      previewPane.style.display = 'none';
      resizer.style.display = 'none';
      editorPane.style.flex = '1';
      editorPane.style.width = '100%';
      toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="2" y="3" width="20" height="18" rx="1" fill="currentColor"/><path d="M6 8h12M6 12h8M6 16h10" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>';
      toggleBtn.title = '当前：仅编辑 (Cmd+E)';
      break;
    case 'preview':
      editorPane.style.display = 'none';
      previewPane.style.display = 'flex';
      resizer.style.display = 'none';
      previewPane.style.flex = '1';
      previewPane.style.width = '100%';
      toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="2" y="3" width="20" height="18" rx="1" fill="currentColor" opacity="0.4"/><path d="M6 8h12M6 12h8M6 16h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
      toggleBtn.title = '当前：仅预览 (Cmd+E)';
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

// 按钮事件
toggleBtn.addEventListener('click', toggleView);

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
