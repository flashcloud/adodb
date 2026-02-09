# Node.js 13.14.0 Windows 7 32位兼容性修复文档

## 1. 问题描述
在 **Windows 7 32位 + Node.js v13.14.0** 环境下，运行 `node example.js` 时，程序在输出 `end wait` 后挂起（Hanging），无法接收到 `cscript.exe` 返回的查询结果。该问题在 Node.js v10.9.0 下不存在。

## 2. 根本原因
### 2.1 Stream 行为差异
- **Node.js 10.x**: 子进程的 `stdout` 默认处于 **Flowing Mode**，会自动触发 `data` 事件。
- **Node.js 13.x**: 子进程的 `stdout` 默认处于 **Paused Mode**，只会触发 `readable` 事件，必须主动调用 `.read()` 才会读取缓冲区数据。

### 2.2 JScript ReadLine 阻塞
在 Windows 7 的 JScript 引擎中，当 Node.js 关闭 `stdin` 流时，`WScript.StdIn.ReadLine()` 会因为触发 "输入超出了文件尾" 错误而阻塞或异常，导致脚本无法优雅退出。

### 2.3 换行符不兼容
Node.js 13.x 在与 `cscript.exe` 通信时，需要显式的 `\r\n` (CRLF) 作为行结束符，而旧版本使用 `\n` (LF) 即可。

## 3. 修复方案

### 3.1 Provider 适配 (provider-local.js)
- **事件监听**: 将 `stdout` 的监听从 `data` 改为 `readable`。
- **主动读取**: 在 `readable` 回调中使用 `while (null !== (chunk = core.stdout.read()))` 主动消耗缓冲区数据。
- **背压处理**: 正确处理 `self.push()` 的返回值，并在 `stdin.write` 中监听 `drain` 事件。

### 3.2 核心进程管理 (core.js)
- **回调延迟**: 在 `spawn` 成功后使用 `process.nextTick` 执行回调，确保 Provider 有足够时间设置事件监听器。
- **参数修正**: 确保 `cscript.exe` 的开关参数（如 `//E:JScript`）位于脚本路径之前。

### 3.3 JScript 脚本优化 (adodb.js)
- **非阻塞检查**: 在调用 `ReadLine()` 前增加 `WScript.StdIn.AtEndOfStream` 检查。
- **字符兼容**: 移除了所有中文全角引号和特殊字符，防止 JScript 解释器报错。
- **错误处理**: 增加了对 EOF 错误（错误码 `-2147024858`）的捕获和优雅退出。

### 3.4 通信协议适配 (utils.js & connection.js)
- **动态换行符**: 增加版本检测，对 Node.js > 10.9.0 的环境自动切换为 `\r\n`。
- **readline 配置**: 在 `readline.createInterface` 中设置 `crlfDelay: Infinity`，以兼容 CRLF 换行。

## 4. 修改文件清单
1. `connection/connection.js`
2. `connection/utils.js`
3. `core/core.js`
4. `core/scripts/adodb.js`
5. `provider/provider-local.js`

## 5. 验证结果
- **环境**: Windows 7 32-bit SP1
- **Node 版本**: v13.14.0
- **数据库**: Access (Jet OLEDB 4.0)
- **状态**: ✅ 已修复。查询结果可正常返回，程序不再挂起。
