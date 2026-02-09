

## 回调重构为 async/await

**一、`util.inherits` → `class extends` 转换（5 个类）**

| 文件 | 旧写法 | 新写法 |
|---|---|---|
| `core/core.js` | `util.inherits(Core, EventEmitter)` | `class Core extends EventEmitter` |
| `connection/connection.js` | `util.inherits(Connection, eventemitter)` | `class Connection extends EventEmitter` |
| `pool/pool.js` | `util.inherits(Pool, eventemitter)` | `class Pool extends EventEmitter` |
| `provider/provider-local.js` | `util.inherits(Provider, Duplex)` | `class ProviderLocal extends Duplex` |
| `provider/provider-remote.js` | `util.inherits(Provider, Duplex)` | `class ProviderRemote extends Duplex` |

所有构造函数体内的 `EventEmitter.call(this)` / `Duplex.call(this)` 都已替换为 `super()`，原型方法全部转为 class 方法。

**二、回调 → async/await 转换**

核心变更链路（自底向上）：

- `Core.spawn(callback)` → `async spawn()` 返回 Promise
- `getCore(connStr, endStr, callback)` → `async getCore(connStr, endStr)` 返回 Core
- `ProviderLocal` / `ProviderRemote` 构造函数中的异步初始化 → 拆分为 constructor（同步）+ `async init()`
- `getProvider(options, callback)` → `async getProvider(options)`，内部 `await provider.init()`
- `Connection.connect(callback)` → `async connect()`，内部 `await getProvider()`
- `Connection.query(sql, values, callback)` → `async query(sql, values)` 返回 `{ records, fields }`，文件读取改用 `fs.promises.readFile`
- `Pool._getConnection(callback)` → `_getConnection()` 返回 Promise
- `Pool.query(sql, values, callback)` → `async query(sql, values)` 返回 `{ records, fields }`
- `server/server.js` 中 `fs.readFile`/`fs.writeFile` → `fs.promises` + async IIFE

**三、附带清理**

- 移除了所有不再需要的 `require('util')`
- `new Buffer()` → `Buffer.from()`（provider-remote.js）
- server 工具文件中 `function()` → 箭头函数，`var` → `const`
- 测试文件全部从 `done` 回调改为 `async` 函数，解构 `{ records, fields }`

**公共 API 变化说明**：`connection.query()` 和 `pool.query()` 现在返回 `{ records, fields }` 对象而非通过回调传递三个参数，使用时需要 `const { records, fields } = await conn.query(sql)`。