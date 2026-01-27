const { app, BrowserWindow, Menu, dialog, ipcMain, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// 设置应用名称（macOS 菜单栏显示）
if (process.platform === 'darwin') {
  app.name = 'easyMD';
  // 设置 Dock 图标
  app.whenReady().then(() => {
    app.dock.setIcon(path.join(__dirname, 'icon.png'));
  });
}
app.setName('easyMD');

let mainWindow;
let currentFilePath = null;

// 默认设置
let settings = {
  imageStorageType: 'local', // 'local' 或 'imgbed'
  imgbedType: 'smms',
  imgbedToken: '',
  imgbedCustomUrl: ''
};

// 加载设置
function loadSettings() {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch (err) {
    console.error('加载设置失败:', err);
  }
}

// 保存设置
function saveSettings(newSettings) {
  settings = { ...settings, ...newSettings };
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('保存设置失败:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  // 创建菜单
  createMenu();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createMenu() {
  const isMac = process.platform === 'darwin';
  
  const template = [
    // macOS 应用菜单
    ...(isMac ? [{
      label: 'easyMD',
      submenu: [
        { role: 'about', label: '关于 easyMD' },
        { type: 'separator' },
        {
          label: '设置...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow.webContents.send('open-settings');
          }
        },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 easyMD' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: '退出 easyMD' }
      ]
    }] : []),
    {
      label: '文件',
      submenu: [
        {
          label: '新建',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('new-file');
          }
        },
        {
          label: '打开',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            openFile();
          }
        },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            saveFile();
          }
        },
        {
          label: '另存为',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            saveFileAs();
          }
        },
        { type: 'separator' },
        {
          label: '打印',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            mainWindow.webContents.send('print-request');
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '切换预览',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow.webContents.send('toggle-preview');
          }
        },
        { type: 'separator' },
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function openFile() {
  dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  }).then(result => {
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          dialog.showErrorBox('错误', '无法打开文件');
          return;
        }
        currentFilePath = filePath;
        mainWindow.webContents.send('file-opened', data, filePath);
      });
    }
  });
}

function saveFile() {
  if (currentFilePath) {
    mainWindow.webContents.send('save-file', currentFilePath);
  } else {
    saveFileAs();
  }
}

function saveFileAs() {
  dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  }).then(result => {
    if (!result.canceled && result.filePath) {
      currentFilePath = result.filePath;
      mainWindow.webContents.send('save-file', result.filePath);
    }
  });
}

// 处理保存文件的请求
ipcMain.on('write-file', (event, filePath, content) => {
  fs.writeFile(filePath, content, 'utf8', (err) => {
    if (err) {
      dialog.showErrorBox('错误', '无法保存文件');
      return;
    }
    currentFilePath = filePath;
    mainWindow.webContents.send('file-saved', filePath);
  });
});

// 处理打开文件按钮的请求
ipcMain.on('open-file-request', () => {
  openFile();
});

// 处理保存文件按钮的请求
ipcMain.on('save-file-request', () => {
  saveFile();
});

// 获取设置
ipcMain.handle('get-settings', () => {
  return settings;
});

// 保存设置
ipcMain.on('save-settings', (event, newSettings) => {
  saveSettings(newSettings);
});

// 获取当前文件路径
ipcMain.handle('get-current-file-path', () => {
  return currentFilePath;
});

// 保存粘贴的图片到本地
ipcMain.handle('save-pasted-image', async (event, imageDataUrl, docFilePath) => {
  try {
    // 确定保存目录
    let imageDir;
    let baseDir;
    if (docFilePath) {
      baseDir = path.dirname(docFilePath);
      imageDir = path.join(baseDir, 'image');
    } else {
      // 如果文档未保存，保存到用户文档目录
      baseDir = app.getPath('documents');
      imageDir = path.join(baseDir, 'easyMD-images');
    }
    
    // 确保目录存在
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }
    
    // 生成文件名
    const timestamp = Date.now();
    const fileName = `image-${timestamp}.png`;
    const filePath = path.join(imageDir, fileName);
    
    // 从 dataURL 提取 base64 数据
    const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // 写入文件
    fs.writeFileSync(filePath, buffer);
    
    // 返回相对路径和基础目录
    if (docFilePath) {
      return { relativePath: `image/${fileName}`, baseDir: baseDir };
    } else {
      return { relativePath: `easyMD-images/${fileName}`, baseDir: baseDir };
    }
  } catch (err) {
    console.error('保存图片失败:', err);
    throw err;
  }
});

// 上传图片到图床
ipcMain.handle('upload-to-imgbed', async (event, imageDataUrl) => {
  const https = require('https');
  const http = require('http');
  
  try {
    const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
    
    if (settings.imgbedType === 'smms') {
      // SM.MS 图床
      return await uploadToSmms(base64Data, settings.imgbedToken);
    } else if (settings.imgbedType === 'imgur') {
      // Imgur 图床
      return await uploadToImgur(base64Data, settings.imgbedToken);
    } else if (settings.imgbedType === 'custom') {
      // 自定义图床
      return await uploadToCustom(base64Data, settings.imgbedCustomUrl, settings.imgbedToken);
    }
  } catch (err) {
    console.error('上传图片失败:', err);
    throw err;
  }
});

// SM.MS 上传
function uploadToSmms(base64Data, token) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const FormData = require('form-data');
    
    const buffer = Buffer.from(base64Data, 'base64');
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="smfile"; filename="image.png"\r\nContent-Type: image/png\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    
    const options = {
      hostname: 'sm.ms',
      path: '/api/v2/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Authorization': token,
        'Content-Length': body.length
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.success) {
            resolve(json.data.url);
          } else {
            reject(new Error(json.message || '上传失败'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Imgur 上传
function uploadToImgur(base64Data, clientId) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    
    const postData = `image=${encodeURIComponent(base64Data)}`;
    
    const options = {
      hostname: 'api.imgur.com',
      path: '/3/image',
      method: 'POST',
      headers: {
        'Authorization': `Client-ID ${clientId}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.success) {
            resolve(json.data.link);
          } else {
            reject(new Error(json.data?.error || '上传失败'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// 自定义图床上传
function uploadToCustom(base64Data, url, token) {
  return new Promise((resolve, reject) => {
    const urlModule = require('url');
    const parsedUrl = new URL(url);
    const httpModule = parsedUrl.protocol === 'https:' ? require('https') : require('http');
    
    const buffer = Buffer.from(base64Data, 'base64');
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image.png"\r\nContent-Type: image/png\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Authorization': token,
        'Content-Length': body.length
      }
    };
    
    const req = httpModule.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          // 尝试从常见字段获取 URL
          const imageUrl = json.url || json.data?.url || json.link || json.data?.link;
          if (imageUrl) {
            resolve(imageUrl);
          } else {
            reject(new Error('无法获取图片 URL'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

app.whenReady().then(() => {
  loadSettings();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
