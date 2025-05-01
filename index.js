const { exec, spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');

// WebSocket配置
const externalPort = 8080;
const internalUrl = 'ws://localhost:4000';

// 检查必要文件
function checkFiles() {
  if (!fs.existsSync('./web.js')) {
    console.error('错误: web.js 文件不存在');
    process.exit(1);
  }
  if (!fs.existsSync('./config.json')) {
    console.error('错误: config.json 文件不存在');
    process.exit(1);
  }
}

// 执行启动命令并监控
function startWebJs() {
  // 更改web.js权限
  exec('chmod +x ./web.js', (error) => {
    if (error) {
      console.error('更改权限错误:', error.message);
      process.exit(1);
    }
    console.log('web.js 权限已设置为可执行');

    // 启动并监控web.js
    function spawnWebJs() {
      console.log(`[${new Date().toISOString()}] 启动 web.js`);
      const webProcess = spawn('./web.js', ['-c', 'config.json'], {
        stdio: ['ignore', 'pipe', 'pipe'], // 标准输入忽略，输出和错误流重定向
        shell: true, // 使用shell运行以确保环境变量
      });

      webProcess.stdout.on('data', (data) => {
        console.log(`web.js 输出: ${data}`);
      });

      webProcess.stderr.on('data', (data) => {
        console.error(`web.js 错误: ${data}`);
      });

      webProcess.on('close', (code) => {
        console.log(`[${new Date().toISOString()}] web.js 进程退出，退出码: ${code}`);
        console.log('3秒后重启 web.js...');
        setTimeout(spawnWebJs, 3000); // 3秒后重启
      });

      webProcess.on('error', (err) => {
        console.error(`[${new Date().toISOString()}] 启动 web.js 失败: ${err.message}`);
        console.log('3秒后重启 web.js...');
        setTimeout(spawnWebJs, 3000); // 3秒后重启
      });
    }

    spawnWebJs();
  });
}

// 创建WebSocket代理服务器
function startWebSocketProxy() {
  const wss = new WebSocket.Server({ port: externalPort });
  console.log(`WebSocket代理服务器运行在 ws://localhost:${externalPort}`);

  wss.on('connection', (wsClient) => {
    console.log('新客户端连接到8080端口');

    // 连接到内部4000端口
    const wsInternal = new WebSocket(internalUrl);

    wsInternal.on('open', () => {
      console.log('已连接到内部4000端口');
    });

    // 转发客户端消息到内部服务
    wsClient.on('message', (data) => {
      if (wsInternal.readyState === WebSocket.OPEN) {
        wsInternal.send(data);
      }
    });

    // 转发内部服务消息到客户端
    wsInternal.on('message', (data) => {
      if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(data);
      }
    });

    // 处理关闭和错误
    wsClient.on('close', () => {
      console.log('客户端断开连接');
      wsInternal.close();
    });

    wsInternal.on('close', () => {
      console.log('内部4000端口连接断开');
      wsClient.close();
    });

    wsClient.on('error', (error) => {
      console.error('客户端错误:', error.message);
      wsInternal.close();
    });

    wsInternal.on('error', (error) => {
      console.error('内部连接错误:', error.message);
      wsClient.close();
    });
  });

  wss.on('error', (error) => {
    console.error('WebSocket服务器错误:', error.message);
  });
}

// 主逻辑
function main() {
  // 检查文件
  checkFiles();

  // 启动web.js
  startWebJs();

  // 启动WebSocket代理
  startWebSocketProxy();
}

// 运行
main();