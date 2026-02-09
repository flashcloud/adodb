BETA

## 这是什么

这是一个用于对 MS Access 数据库执行 SQL 查询的 Node.js 包。设计用于 Windows XP 及以上系统。
在“客户端-服务器”模式下，客户端部分不受操作系统限制。

## 为什么需要它

用于从 Node.js 应用连接 MS Access 格式的数据库。

## 有哪些类似方案

[node-adodb](https://github.com/nuintun/node-adodb)。从那里借鉴了通过 JScript 连接
ADODB.Connection 的思路。本包实际上是对 node-adodb 的改造，旨在新增功能并修复缺陷。

## 工作原理

Node.js 会启动（spawn）Windows Script Host 进程来执行一段短 JScript，
JScript 使用 ADODB.Connection 实际执行 SQL 查询。进程间通过标准输入输出流传递数据：stdin、
stdout、sterr。

## 系统要求

Windows XP、7、Vista、8、8.1、10，Node.js v.4.x、v.10.x、v.13.x（更高版本未测试，因为它们无法在 Windows XP/7 上运行），
Microsoft.Jet.OLEDB.4.0。若以“客户端-服务器”模式使用，本要求仅适用于服务器端。
客户端不包含 Windows 特有代码。

## 额外功能

1.  扩展 SQL 语法：
    1.  允许代码内注释
    1.  TODO 支持通过 ";" 的多语句（multiple statements）
1.  支持客户端-服务器模式。
1.  Turbo 模式：使用 Recordset.GetString() 代替 Recordset.MoveNext()，显著提升查询速度，
    尤其是在列数较多时。使用 Turbo 模式的前提是返回数据中保证不包含制表符
    （Recordset.GetString() 使用制表符分隔行列）。TODO 关闭 Turbo 模式以便无约束使用。
1.  TODO 以流（stream）方式返回 SQL 查询结果。

## 使用方法

### 普通（文件）模式

#### 安装
    npm install adodb --save

#### 使用
```js
const ADODB = require('adodb');

const connStr = 'Provider=Microsoft.Jet.OLEDB.4.0;Data Source=Northwind2003.mdb'; 
// if you have installed server connection string can be like this
// const connStr = 'Provider=Adodb-server;Host=127.0.0.1;Port=4023'

const pool = ADODB.createPool(connStr);

(async () => {
    try {
        const { records } = await pool.query('SELECT * FROM Categories;');
        console.log(records);
    } catch (err) {
        console.error(err.message);
    } finally {
        pool.end();
    }
})();
```

### 客户端-服务器模式

#### 服务器端
##### 安装服务器端

```powershell
    C:\>npm install adodb -g
    C:\>mkdir adodb-config
    C:\>cd adodb-config
    C:\adodb-config>adodb run
    ADODB_PATH: undefined
    config file: C:\adodb\adodb-config.json
    opened server on {"address":"::","family":"IPv6","port":4023}
    Ctrl+C
    ^C完成批处理文件的执行 [Y(是)/N(否)]? y
```

当前目录会生成 `adodb-config.json`。
需要编辑该文件，填写端口和 MS Access 数据库连接字符串。
如果存在系统变量 `ADODB_PATH`，`adodb-config.json` 会在该变量指定目录下创建。

##### 启动服务器以验证配置：

    C:\adodb-config>adodb run

##### 检查服务器是否正常

```powershell
    C:\>telnet localhost 4023
    connStr: Provider=Microsoft.Jet.OLEDB.4.0;Data Source=Data Source=C:\node487\node_modules\adodb\test\media\Northwind2003.mdb
    endStr: END{6251729b-82fb-4b89-9bf8-d550c78acd3f}
    LOCALS
    {"OEMCP":"866","ACP":"1251","sDecimal":",","sShortDate":"yyyy-MM-dd","sTimeFormat":"H:m:s"}
    END{6251729b-82fb-4b89-9bf8-d550c78acd3f}
    testing db connection: OK


    CTRL+]
    Microsoft Telnet> q
    C:\>
```

##### 将服务器安装为 Windows 服务

```powershell
    C:\adodb-config>adodb install
```

##### 卸载已安装的 Windows 服务

```powershell
    C:\adodb-config>adodb uninstall
```

##### 完整命令列表

```powershell  
    C:\adodb-config>adodb
```
    
#### 客户端
```js
const ADODB = require('adodb');

const connStr = 'Provider=Adodb-server;Host=127.0.0.1;Port=4023'

const pool = ADODB.createPool(connStr);

(async () => {
    try {
        const { records } = await pool.query('SELECT * FROM Categories;');
        console.log(records);
    } catch (err) {
        console.error(err.message);
    } finally {
        pool.end();
    }
})();
```

