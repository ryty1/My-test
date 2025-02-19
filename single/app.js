require('dotenv').config();
const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const app = express();

const username = process.env.USER.toLowerCase(); // 获取当前用户名并转换为小写
const DOMAIN_DIR = path.join(process.env.HOME, "domains", `${username}.serv00.net`, "public_nodejs");
const scriptPath = path.join(process.env.HOME, "serv00-play", "singbox", "start.sh");
const configFilePath = path.join(__dirname, 'config.json');
const SINGBOX_CONFIG_PATH = path.join(process.env.HOME, "serv00-play", "singbox", "singbox.json");

// 允许静态文件访问
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());
let logs = [];
let latestStartLog = "";
function logMessage(message) {
    logs.push(message);
    if (logs.length > 5) logs.shift();
}
function executeCommand(command, actionName, isStartLog = false, callback) {
    exec(command, (err, stdout, stderr) => {
        const timestamp = new Date().toLocaleString();
        if (err) {
            logMessage(`${actionName} 执行失败: ${err.message}`);
            if (callback) callback(err.message);
            return;
        }
        if (stderr) {
            logMessage(`${actionName} 执行标准错误输出: ${stderr}`);
        }
        const successMsg = `${actionName} 执行成功:\n${stdout}`;
        logMessage(successMsg);
        if (isStartLog) latestStartLog = successMsg;
        if (callback) callback(stdout);
    });
}
function runShellCommand() {
    const command = `cd ${process.env.HOME}/serv00-play/singbox/ && bash start.sh`;
    executeCommand(command, "start.sh", true);
}

function executeHy2ipScript(logMessages, callback) {

    const command = `cd ${process.env.HOME}/domains/${username}.serv00.net/public_nodejs/ && bash hy2ip.sh`;

    // 执行脚本并捕获输出
    exec(command, (error, stdout, stderr) => {
        callback(error, stdout, stderr);
    });
}
function KeepAlive() {
    const command = `cd ${process.env.HOME}/serv00-play/ && bash keepalive.sh`;
    executeCommand(command, "keepalive.sh", true);
}
setInterval(KeepAlive, 20000);

app.get("/info", (req, res) => {
    runShellCommand();
    KeepAlive();
    res.sendFile(path.join(__dirname, "public", "info.html"));
});

// 中间件：解析请求体
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/hy2ip", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "hy2ip.html"));
});

app.post("/hy2ip/execute", (req, res) => {
    const confirmation = req.body.confirmation?.trim();

    if (confirmation !== "更新") {
        return res.json({ success: false, errorMessage: "输入错误！请返回并输入“更新”以确认。" });
    }

    try {
        let logMessages = [];

        executeHy2ipScript(logMessages, (error, stdout, stderr) => {
            let updatedIp = "";

            if (stdout) {
                let outputMessages = stdout.split("\n");
                outputMessages.forEach(line => {
                    if (line.includes("SingBox 配置文件成功更新IP为")) {
                        updatedIp = line.split("SingBox 配置文件成功更新IP为")[1].trim();
                    }
                    if (line.includes("Config 配置文件成功更新IP为")) {
                        updatedIp = line.split("Config 配置文件成功更新IP为")[1].trim();
                    }
                });
                updatedIp = updatedIp.replace(/\x1B\[[0-9;]*m/g, "");

                if (updatedIp && updatedIp !== "未找到可用的 IP！") {
                    logMessages.push("命令执行成功");
                    logMessages.push(`SingBox 配置文件成功更新IP为 ${updatedIp}`);
                    logMessages.push(`Config 配置文件成功更新IP为 ${updatedIp}`);
                    logMessages.push("sing-box 已重启");
                    res.json({ success: true, ip: updatedIp, logs: logMessages });
                } else {
                    logMessages.push("命令执行成功");
                    logMessages.push("没有找到有效 IP");
                    res.json({ success: false, errorMessage: "没有找到有效的 IP", logs: logMessages });
                }
            }
        });
    } catch (error) {
        let logMessages = ["命令执行成功", "没有找到有效 IP"];
        res.json({ success: false, errorMessage: "命令执行失败", logs: logMessages });
    }
});

// 日志和进程详情接口
app.get("/api/log", (req, res) => {
    const command = "ps aux"; 

    exec(command, (err, stdout, stderr) => {
        if (err) {
            return res.json({
                error: true,
                message: `执行错误: ${err.message}`,
                logs: "暂无日志",
                processOutput: ""
            });
        }

        const processOutput = stdout.trim(); 
        const latestLog = logs[logs.length - 1] || "暂无日志";
        
        res.json({
            error: false,
            message: "成功获取数据",
            logs: latestLog,
            processOutput: processOutput
        });
    });
});

// 提供静态页面
app.get("/log", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "log.html"));
});

app.get('/ota/update', (req, res) => {
    const downloadScriptCommand = 'curl -Ls https://raw.githubusercontent.com/ryty1/My-test/refs/heads/main/single/ota.sh -o /tmp/ota.sh';

    exec(downloadScriptCommand, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ 下载脚本错误: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
        if (stderr) {
            console.error(`❌ 下载脚本错误输出: ${stderr}`);
            return res.status(500).json({ success: false, message: stderr });
        }

        const executeScriptCommand = 'bash /tmp/ota.sh';

        exec(executeScriptCommand, (error, stdout, stderr) => {
            exec('rm -f /tmp/ota.sh', (err) => {
                if (err) {
                    console.error(`❌ 删除临时文件失败: ${err.message}`);
                } else {
                    console.log('✅ 临时文件已删除');
                }
            });

            if (error) {
                console.error(`❌ 执行脚本错误: ${error.message}`);
                return res.status(500).json({ success: false, message: error.message });
            }
            if (stderr) {
                console.error(`❌ 脚本错误输出: ${stderr}`);
                return res.status(500).json({ success: false, message: stderr });
            }
            
            res.json({ success: true, output: stdout });
        });
    });
});

app.get('/ota', (req, res) => {
    res.sendFile(path.join(__dirname, "public", "ota.html"));
});

app.get("/node", (req, res) => {
    const filePath = path.join(process.env.HOME, "serv00-play/singbox/list");
    fs.readFile(filePath, "utf8", (err, data) => {
        if (err) {
            res.type("html").send(`<pre>无法读取文件: ${err.message}</pre>`);
            return;
        }

        const cleanedData = data
            .replace(/(vmess:\/\/|hysteria2:\/\/|proxyip:\/\/|https:\/\/)/g, '\n$1')
            .trim();

        const vmessPattern = /vmess:\/\/[^\n]+/g;
        const hysteriaPattern = /hysteria2:\/\/[^\n]+/g;
        const httpsPattern = /https:\/\/[^\n]+/g;
        const proxyipPattern = /proxyip:\/\/[^\n]+/g;
        const vmessConfigs = cleanedData.match(vmessPattern) || [];
        const hysteriaConfigs = cleanedData.match(hysteriaPattern) || [];
        const httpsConfigs = cleanedData.match(httpsPattern) || [];
        const proxyipConfigs = cleanedData.match(proxyipPattern) || [];
        const allConfigs = [...vmessConfigs, ...hysteriaConfigs, ...httpsConfigs, ...proxyipConfigs];

        let htmlContent = `
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
                <title>节点信息</title>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        font-family: Arial, sans-serif;
                        background-color: #f4f4f4;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        padding: 10px;
                    }
                    .content-container {
                        width: 90%;
                        max-width: 600px;
                        background-color: #fff;
                        padding: 15px;
                        border-radius: 8px;
                        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                        text-align: left;
                        box-sizing: border-box;
                    }
                    h3 {
                        font-size: 20px;
                        margin-bottom: 10px;
                        text-align: center;
                    }
                    .config-box {
                        max-height: 65vh;
                        overflow-y: auto;
                        border: 1px solid #ccc;
                        padding: 8px;
                        background-color: #f9f9f9;
                        box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.1);
                        border-radius: 5px;
                        white-space: pre-wrap;
                        word-break: break-word;
                        font-size: 14px;
                    }
                    .copy-btn {
                        display: block;
                        width: 100%;
                        padding: 12px;
                        font-size: 16px;
                        background-color: #007bff;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        text-align: center;
                        margin-top: 15px;
                        transition: background-color 0.3s;
                    }
                    .copy-btn:hover {
                        background-color: #0056b3;
                    }
                    @media (max-width: 600px) {
                        .content-container {
                            padding: 12px;
                        }
                        .config-box {
                            font-size: 13px;
                        }
                        .copy-btn {
                            font-size: 15px;
                            padding: 10px;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="content-container">
                    <h3>节点信息</h3>
                    <div class="config-box" id="configBox">
        `;

        allConfigs.forEach((config) => {
            htmlContent += `<div>${config.trim()}</div>`; // 去掉首尾空格
        });

        htmlContent += `
                    </div>
                    <button class="copy-btn" onclick="copyToClipboard()">一键复制</button>
                </div>

                <script>
                    function copyToClipboard() {
                        const element = document.getElementById("configBox");
                        let text = Array.from(element.children)
                            .map(child => child.textContent.trim())
                            .join("\\n");

                        navigator.clipboard.writeText(text).then(() => {
                            alert("已复制到剪贴板！");
                        }).catch(() => {
                            alert("复制失败，请手动复制！");
                        });
                    }
                </script>
            </body>
            </html>
        `;
        res.type("html").send(htmlContent);
    });
});

// 检查并读取配置文件
function getConfigFile() {
    console.log('检查配置文件是否存在:', configFilePath);
    
    try {
        if (fs.existsSync(configFilePath)) {
            console.log('配置文件已存在，读取文件内容...');
            return JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
        } else {
            console.log('配置文件不存在，创建默认配置并写入...');
            const defaultConfig = {
                vmessname: "Argo-vmess",
                hy2name: "Hy2",
                HIDE_USERNAME: false // 添加默认的 HIDE_USERNAME 配置
            };
            fs.writeFileSync(configFilePath, JSON.stringify(defaultConfig, null, 2));
            console.log('配置文件已创建:', configFilePath);
            
            // 同时写入到 start.sh 脚本
            writeDefaultConfigToScript(defaultConfig);
            return defaultConfig;
        }
    } catch (error) {
        console.error('读取配置文件时出错:', error);
        return null;
    }
}

// 写入默认配置到 start.sh 脚本
function writeDefaultConfigToScript(config) {
    console.log('写入默认配置到脚本:', scriptPath);
    let scriptContent;

    try {
        scriptContent = fs.readFileSync(scriptPath, 'utf8');
    } catch (error) {
        console.error('读取脚本文件时出错:', error);
        return;
    }

    // 找到 export_list() 函数的位置
    const exportListFuncPattern = /export_list\(\)\s*{([^}]*)}/;
    const match = scriptContent.match(exportListFuncPattern);

    if (match) {
        let exportListContent = match[1];

        // 在 export_list() 函数内部定义 custom_vmess 和 custom_hy2 变量
        if (!exportListContent.includes('custom_vmess')) {
            exportListContent = `  custom_vmess="${config.vmessname}"\n` + exportListContent;
        }
        if (!exportListContent.includes('custom_hy2')) {
            exportListContent = `  custom_hy2="${config.hy2name}"\n` + exportListContent;
        }

        // 替换 export_list() 函数内容
        scriptContent = scriptContent.replace(exportListFuncPattern, `export_list() {\n${exportListContent}}`);
    } else {
        console.log("没有找到 export_list() 函数，无法插入变量定义。");
    }

    // 替换 vmessname 和 hy2name 使用变量的格式
    scriptContent = scriptContent.replace(/vmessname=".*?"/, `vmessname="\$custom_vmess-\$host-\$user"`);
    scriptContent = scriptContent.replace(/hy2name=".*?"/, `hy2name="\$custom_hy2-\$host-\$user"`);

    // 根据 HIDE_USERNAME 配置，修改 user 变量定义
    if (config.HIDE_USERNAME) {
        // 启用隐藏用户名
        scriptContent = scriptContent.replace(/user=".*?"/, `user="\$(whoami | tail -c 2 | head -c 1)"`);
    } else {
        // 禁用隐藏用户名
        scriptContent = scriptContent.replace(/user=".*?"/, `user="\$(whoami)"`);
    }

    // 将更新后的内容写回脚本
    try {
        fs.writeFileSync(scriptPath, scriptContent);
        console.log('脚本已更新:', scriptPath);
    } catch (error) {
        console.error('写入脚本文件时出错:', error);
    }
}


// 更新配置文件和脚本内容
async function updateConfigFile(config) {
    console.log('更新配置文件:', configFilePath);

    try {
        // 更新配置文件
        fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
        console.log('配置文件更新成功');
    } catch (error) {
        console.error('更新配置文件时出错:', error);
        return;
    }

    console.log('更新脚本内容:', scriptPath);
    let scriptContent;

    try {
        // 更新脚本中的变量
        scriptContent = fs.readFileSync(scriptPath, 'utf8');
    } catch (error) {
        console.error('读取脚本文件时出错:', error);
        return;
    }

    scriptContent = scriptContent.replace(/custom_vmess=".*?"/, `custom_vmess="${config.vmessname}"`);
    scriptContent = scriptContent.replace(/custom_hy2=".*?"/, `custom_hy2="${config.hy2name}"`);

    // 同步更新 vmessname 和 hy2name 的定义
    scriptContent = scriptContent.replace(/vmessname=".*?"/, `vmessname="\$custom_vmess-\$host-\$user"`);
    scriptContent = scriptContent.replace(/hy2name=".*?"/, `hy2name="\$custom_hy2-\$host-\$user"`);

    // 同步更新 HIDE_USERNAME
    if (config.HIDE_USERNAME) {
        scriptContent = scriptContent.replace(/user=".*?"/, `user="\$(whoami | tail -c 2 | head -c 1)"`);
    } else {
        scriptContent = scriptContent.replace(/user=".*?"/, `user="\$(whoami)"`);
    }

    try {
        // 写回修改后的脚本
        fs.writeFileSync(scriptPath, scriptContent);
        console.log('脚本更新成功:', scriptPath);
    } catch (error) {
        console.error('写入脚本文件时出错:', error);
        return;
    }

    // 延迟3秒后杀死进程
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 定义要杀死的进程
    const processes = ['cloudflare', 'serv00sb'];

    // 使用 async/await 处理进程的杀死操作
    for (const process of processes) {
        try {
            // 查找进程 ID
            const { stdout, stderr } = await execAsync(`pgrep ${process}`);
            if (stderr) {
                console.error(`查找进程 ${process} 时出错:`, stderr);
                return;
            }

            if (stdout) {
                const pids = stdout.split('\n').filter(pid => pid.trim() !== ''); // 获取PID
                console.log(`Killing process: ${process} (PIDs: ${pids.join(', ')})`);

                // 逐个杀死进程
                for (const pid of pids) {
                    try {
                        await execAsync(`kill -9 ${pid}`);
                        console.log(`进程 ${pid} 已被杀死`);
                    } catch (killError) {
                        console.error(`杀死进程 ${pid} 时出错:`, killError);
                    }
                }
            }
        } catch (error) {
            console.error(`查找进程 ${process} 时出错:`, error);
        }
        runShellCommand();
    }
}

// 将 exec 转换为返回 Promise 的异步函数
function execAsync(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

// 路由：获取配置
app.get('/api/get-config', (req, res) => {
    const config = getConfigFile();
    res.json(config);
});

// 更新配置
app.post('/api/update-config', (req, res) => {
    const { vmessname, hy2name, HIDE_USERNAME } = req.body;
    const newConfig = { vmessname, hy2name, HIDE_USERNAME };

    // 更新配置文件
    updateConfigFile(newConfig);

    res.json({ success: true });
});

// 路由：渲染前端页面
app.get('/newset', (req, res) => {
    res.sendFile(path.join(__dirname, "public", 'newset.html'));
});

// 获取当前的 GOOD_DOMAIN
app.get('/getGoodDomain', (req, res) => {
  fs.readFile(SINGBOX_CONFIG_PATH, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: '读取配置文件失败' });
    }
    
    const config = JSON.parse(data);
    res.json({ GOOD_DOMAIN: config.GOOD_DOMAIN });
  });
});

// 更新 GOOD_DOMAIN
app.post('/updateGoodDomain', (req, res) => {
  const newGoodDomain = req.body.GOOD_DOMAIN;

  if (!newGoodDomain) {
    return res.status(400).json({ success: false, error: '缺少 GOOD_DOMAIN' });
  }

  fs.readFile(SINGBOX_CONFIG_PATH, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ success: false, error: '读取配置文件失败' });
    }

    const config = JSON.parse(data);
    config.GOOD_DOMAIN = newGoodDomain;

    fs.writeFile(SINGBOX_CONFIG_PATH, JSON.stringify(config, null, 2), (err) => {
      if (err) {
        return res.status(500).json({ success: false, error: '保存配置文件失败' });
      }
// 获取当前的 GOOD_DOMAIN
app.get('/getGoodDomain', (req, res) => {
  fs.readFile(SINGBOX_CONFIG_PATH, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: '读取配置文件失败' });
    }
    
    const config = JSON.parse(data);
    res.json({ GOOD_DOMAIN: config.GOOD_DOMAIN });
  });
});

// 更新 GOOD_DOMAIN
app.post('/updateGoodDomain', (req, res) => {
  const newGoodDomain = req.body.GOOD_DOMAIN;

  if (!newGoodDomain) {
    return res.status(400).json({ success: false, error: '缺少 GOOD_DOMAIN' });
  }

  fs.readFile(SINGBOX_CONFIG_PATH, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ success: false, error: '读取配置文件失败' });
    }

    const config = JSON.parse(data);
    config.GOOD_DOMAIN = newGoodDomain;

    fs.writeFile(SINGBOX_CONFIG_PATH, JSON.stringify(config, null, 2), (err) => {
      if (err) {
        return res.status(500).json({ success: false, error: '保存配置文件失败' });
      }
      res.json({ success: true });
    });
  });
});

// 路由：返回 goodomains.html 页面
app.get("/goodomains", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "goodomains.html"));
});

app.use((req, res, next) => {
    const validPaths = ["/info", "/hy2ip", "/node", "/log", "/newset", "/goodomains", "/ota"];
    if (validPaths.includes(req.path)) {
        return next();
    }
    res.status(404).send("页面未找到");
});
app.listen(3000, () => {
    const timestamp = new Date().toLocaleString();
    const startMsg = `${timestamp} 服务器已启动，监听端口 3000`;
    logMessage(startMsg);
    console.log(startMsg);
});