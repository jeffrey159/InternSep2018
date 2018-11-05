const express = require("express");
const logger = require("morgan");
const redis = require("redis");
const http = require("http");
const bodyParser = require("body-parser");
const path = require("path");
const arangojs = require("arangojs");
const _ = require('lodash');
const PromiseFtp = require('promise-ftp');
const os = require("os");
const moment = require("moment");
const dir = (os.platform == "win32") ? process.cwd().split(path.sep)[0] : "/"; //process.cwd() < gets current working directory
const app = express();
var ftp = new PromiseFtp();
var x = null;

var LOG_GETProcess_DB = 0;
var LOG_GETHEADER_DB = 0;

const db = new arangojs.Database({
    url: "http://192.168.133.153:8529"
});
db.useDatabase('visualprogger');
db.useBasicAuth("root", "1234");


redisClient = redis.createClient();

//run 127.0.0.1:3000 to load page
const server = http.createServer(app).listen(3000, "127.0.0.1");
const io = require("socket.io").listen(server);
//Morgan is used for logging request details.
app.use(logger("dev"));
app.use(bodyParser.json());
app.use(express.static(__dirname + '/public'));
//used for minimizing the amount of logs sent per interval to live visualization if it exceed this length
let length = 1000;
//redis list name
let dbName = "dbBuffer";

//A very slow AQL Query to ArangoDB
//'FOR d IN live FILTER d.id == @fileId and d.typeName == "PSCT_FILE_OPEN" and d.timestamp > DATE_FORMAT(DATE_ADD(DATE_NOW(),"PT12H58M"), "%yyyy-%mm-%dd %hh:%ii:%ss") COLLECT fileName = d.fileName, fileId= d.fileId RETURN { fileName,fileId }',

//ProcessTree.html
//SkipList Indexing query speed improved 2ms
app.get('/getProcesses', function (req, res) {


    var id = req.query.id;
    var timestamp = moment().subtract(1, "minute").format('YYYY-MM-DD HH:mm:ss');
    if (id != null) {
        var start = new Date();
        db.query({
            query: 'FOR d IN live FILTER d.id == @Id and d.typeName == "PSCT_FILE_OPEN" and d.timestamp > @time COLLECT fileName = d.fileName, fileId= d.fileId RETURN { fileName,fileId }',
            bindVars: {
                Id: id,
                time: timestamp
            }
        }).then(
            cursor => cursor.all()
        ).then(function (log) {
            var data = [];
            log.forEach(function (logList) {
                data.push({
                    fileName: logList.fileName,
                    fileId: logList.fileId
                })
            });
            if (LOG_GETProcess_DB == 1) {
                console.log("getProcesses: Retrieving Data for ProcessTree.html ")
                var elapsed = (new Date() - start) / 1000;
                console.log("Time Elapsed: " + elapsed + "s");
            }
            res.send(data);
        });
    }
});

//query and display on Monitor.html after selecting a filename
//skiplist Indexing on both FileId and fileName   
app.get('/QueryFileName', function (req, res) {
    var x = req.query.path;
    var e = x.split(",");
    if (x != null) {
        var start = new Date();
        db.query({
            query: 'FOR d IN live FILTER d.fileId == @fileId OR  d.fileName == ' + e[1] + ' sort d.timestamp DESC limit 100 RETURN d',
            bindVars: {
                fileId: e[0]
            }
        }).then(
            cursor => cursor.all()
        ).then(function (log) {
            var data = [];
            log.forEach(function (logList) {
                data.push({
                    fileName: logList.fileName,
                    timestamp: logList.timestamp,
                    typeName: logList.typeName
                })
            });
            if (LOG_GETProcess_DB == 1) {
                console.log("----------------------------------------------------")
                console.log("QueryFileName: Retrieving Data for Monitor.html  ")
                var elapsed = (new Date() - start) / 1000;
                console.log("Time Elapsed: " + elapsed + "s");
            }
            res.send(data);
        });
    }
});

//Display 7 days chart of daily logs received
app.get('/ChartDataQuery', function (req, res) {
    var timestamp = moment().subtract(1, "week").format('YYYY-MM-DD');

    var start = new Date();
    db.query({
        query: 'FOR d IN live FILTER d.timestamp > @time COLLECT date = SUBSTRING(d.timestamp, 0, 10) WITH COUNT INTO totalPackets RETURN {date,totalPackets}',
        bindVars: {
            time: timestamp
        }
    }).then(
        cursor => cursor.all()
    ).then(
        result => {
            if (LOG_GETProcess_DB == 1) {
                console.log("----------------------------------------------------")
                console.log("ChartDataQuery: Retrieving Data for Index.html  ")
                var elapsed = (new Date() - start) / 1000;
                console.log("Time Elapsed: " + elapsed + "s");
            }

            res.send(result);
        },
        err => console.log('Failed to execute query:', err)
    );

});

//socket io on connection return first few lines defined in db
io.on('connection', (socket) => {
    console.log("New Client Connected: " + socket.id);


    socket.on('IndexPage', () => {
        var start = new Date();
        var timestamp = moment().subtract(1, "minute").format('YYYY-MM-DD HH:mm:ss');

        redisClient.llen(dbName, (err, llen) => {
            redisClient.lrange(dbName, 0, llen, (err, result) => {
                socket.emit("TableDatas", jsonArray(result));
            });
            //Trims the dbBuffer after sending it to socket
            redisClient.ltrim(dbName, llen, -1);
            redisClient.llen(dbName, (err, res) => {
                console.log("dbBuffer Size after retrieving all data: " + res);
            })
        })

        //Query for Total Logs in ArangoDB
        db.query(
            'RETURN LENGTH(live)'
        ).then(function (cursor) {
            if (LOG_GETHEADER_DB == 0) {
                console.log("----------------------------------------------------\nTotalLogs: Retrieving Data for Index.html")
                var elapsed = (new Date() - start) / 1000;
                console.log("Time Elapsed: " + elapsed + "s");
            }
            socket.emit("TotalLogs", cursor._result);
        });

        //SkipList Indexing query speed improved
        //Query for Logs Per Minute in Card Header in Index.html
        db.query({
            query: 'RETURN LENGTH(for d in live filter d.timestamp > @time return d)',
            bindVars: {
                time: timestamp
            }
        }).then(function (cursor) {
                if (LOG_GETHEADER_DB == 1) {
                    console.log("----------------------------------------------------\nLogsPerMin: Retrieving Data for Index.html")
                    var elapsed = (new Date() - start) / 1000;
                    console.log("Time Elapsed: " + elapsed + "s");
                }
                socket.emit("LogCount", cursor._result);
            },
            err => console.log('Failed to execute query:', err)
        );

    });

    socket.on('get', () => {

        /*
        redisClient.llen(dbName, (err, llen) => {
            redisClient.lrange("dirList", 0, llen, (err, result) => {
                //socket.emit("get", jsonArray(result));
                console.log(result);
            });
        });*/

        //Redis is key-value DB, not able to query specific keys to filter unless you store them in hashes.
        //Can only query everything and display. unable to filter at redis side
        redisClient.llen(dbName, (err, llen) => {
            //if size of dbBuffer is lesser than length(1000)
            if (llen < length) {

                redisClient.lrange(dbName, 0, llen, (err, result) => {
                    socket.emit("get", jsonArray(result));
                });

                //Trims the dbBuffer after sending it to socket
                redisClient.ltrim(dbName, llen, -1);
                redisClient.llen(dbName, (err, res) => {
                    console.log("dbBuffer Size after retrieving all data: " + res);
                })

            } else {
                console.log("Else Statement Occured llen > Length(1000)")
                redisClient.lrange(dbName, 0, length, (err, result) => {
                    socket.emit("get", jsonArray(result));
                });
                redisClient.ltrim(dbName, length, -1);
                redisClient.llen(dbName, (err, res) => {
                    console.log(res);
                })
            }
        })
    });



    socket.on('closeconnection', function (msg) {

        ftp.destroy();
        console.log("FTP Connection Terminated");
    });

    socket.on('IPAddress', function (data) {

        x = ftp.connect({
            host: data.ipAdd,
            user: data.username,
            password: data.password
        }).catch(error => {
            console.log(error);
            console.log("something bad happened somewhere!");
        });
    });

    socket.on("FTPConnStatus", () => {
        socket.emit("FTPStatus", ftp.getConnectionStatus());
    });
});

function jsonArray(list) {
    let temp = [];
    for (let i = 0; i < list.length; i++) {
        let item = JSON.parse(list[i]);
        temp.push(item);
    }
    return temp;
}

function bytesToSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    if (bytes === 0) return 'n/a'
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10)
    if (i === 0) return `${bytes} ${sizes[i]}`
    return `${(bytes / (1024 ** i)).toFixed(1)} ${sizes[i]}`
}

//FTP Service Methods
app.get('/files', function (req, res) {

    var currentDir = dir;
    var query = req.query.path || '';
    if (query) currentDir = path.join(dir, query);

    if (ftp.getConnectionStatus() == "connected") {
        x.then(function () {
            return ftp.list(currentDir);
        }).then(function (list) {
            var testData = [];
            list.forEach(function (lists) {
                try {
                    var isDirectory = lists.type;
                    if (isDirectory == 'd') {
                        testData.push({
                            Name: lists.name,
                            IsDirectory: true,
                            Path: path.join(query, lists.name),
                            permission: "User: " + lists.rights.user + " | Group: " + lists.rights.group + " | Other: " + lists.rights.other
                        });
                    } else {
                        var ext = path.extname(lists.name);
                        if (argv.exclude && _.contains(argv.exclude, ext)) {
                            console.log("excluding file ", lists.name);
                            return;
                        } else if (argv.include && !_.contains(argv.include, ext)) {
                            console.log("not including file", lists.name);
                            return;
                        }
                        testData.push({
                            Name: lists.name,
                            Ext: ext,
                            IsDirectory: false,
                            Path: path.join(query, lists.name),
                            Size: bytesToSize(lists.size),
                            permission: "User: " + lists.rights.user + " | Group: " + lists.rights.group + " | Other: " + lists.rights.other
                        });
                    }
                } catch (e) {
                    console.log(e);
                }
                testData = _.sortBy(testData, function (f) {
                    return f.Name
                });

            });
            res.json(testData);
        });

    }

});
app.get("/MkDir", function (req, res) {
    var query = req.query.path || '';
    var e = query.split(",");

    if (ftp.getConnectionStatus() == "connected") {
        x.then(function () {
            ftp.mkdir("/" + e[0] + "/" + e[1]).catch(error => {
                console.log("Occur within ftp.mkdir statement \n" + error);
            });

            return ftp.list("/" + e[0]);
        }).then(function (list) {
            var testData = [];
            list.forEach(function (lists) {

                var isDirectory = lists.type;
                if (isDirectory == 'd') {
                    testData.push({
                        Name: lists.name,
                        IsDirectory: true,
                        Path: path.join(e[0], lists.name),
                        permission: "User: " + lists.rights.user + " | Group: " + lists.rights.group + " | Other: " + lists.rights.other
                    });
                } else {
                    var ext = path.extname(lists.name);
                    if (argv.exclude && _.contains(argv.exclude, ext)) {
                        console.log("excluding file ", lists.name);
                        return;
                    } else if (argv.include && !_.contains(argv.include, ext)) {
                        console.log("not including file", lists.name);
                        return;
                    }
                    testData.push({
                        Name: lists.name,
                        Ext: ext,
                        IsDirectory: false,
                        Path: path.join(e[0], lists.name),
                        Size: bytesToSize(lists.size),
                        permission: "User: " + lists.rights.user + " | Group: " + lists.rights.group + " | Other: " + lists.rights.other
                    });
                }

                testData = _.sortBy(testData, function (f) {
                    return f.Name
                });

            });
            res.json(testData);
        }).catch(error => {
            console.log(error);
            console.log("something bad happened during 2nd then function!");
        });
    }



});

app.get("/rmDir", function (req, res) {
    var query = req.query.path || '';

    if (ftp.getConnectionStatus() == "connected") {
        x.then(function () {
            ftp.rmdir("/" + query).catch(error => {
                console.log("Occur within ftp.rmDir statement \n" + error);
            });
            var idx = query.lastIndexOf("/");
            var path = query.substr(0, idx);

            return ftp.list("/" + path);
        }).then(function (list) {
            var testData = [];
            list.forEach(function (lists) {
                var idx = query.lastIndexOf("/");
                var updatedPath = query.substr(0, idx);
                var isDirectory = lists.type;
                if (isDirectory == 'd') {
                    testData.push({
                        Name: lists.name,
                        IsDirectory: true,
                        Path: path.join(updatedPath, lists.name),
                        permission: "User: " + lists.rights.user + " | Group: " + lists.rights.group + " | Other: " + lists.rights.other
                    });
                } else {
                    var ext = path.extname(lists.name);
                    if (argv.exclude && _.contains(argv.exclude, ext)) {
                        console.log("excluding file ", lists.name);
                        return;
                    } else if (argv.include && !_.contains(argv.include, ext)) {
                        console.log("not including file", lists.name);
                        return;
                    }
                    testData.push({
                        Name: lists.name,
                        Ext: ext,
                        IsDirectory: false,
                        Path: path.join(updatedPath, lists.name),
                        Size: bytesToSize(lists.size),
                        permission: "User: " + lists.rights.user + " | Group: " + lists.rights.group + " | Other: " + lists.rights.other
                    });
                }

                testData = _.sortBy(testData, function (f) {
                    return f.Name
                });

            });
            res.json(testData);
        }).catch(error => {
            console.log(error);
            console.log("something bad happened during 2nd then function!");
        });
    }

});

const argv = require('yargs')
    .usage('Usage: $0 <command> [options]')
    .command('$0', 'Browse file system.')
    .example('$0 -e .js .swf .apk', 'Exclude extensions while browsing.')
    .alias('i', 'include')
    .array('i')
    .describe('i', 'File extension to include.')
    .alias('e', 'exclude')
    .array('e')
    .describe('e', 'File extensions to exclude.')
    .alias('p', 'port')
    .describe('p', 'Port to run the file-browser. [default:8088]')
    .help('h')
    .alias('h', 'help')
    .check(_checkValidity)
    .argv;

function _checkValidity(argv) {
    if (argv.i && argv.e) return new Error('Select -i or -e.');
    if (argv.i && argv.i.length == 0) return new Error('Supply at least one extension for -i option.');
    if (argv.e && argv.e.length == 0) return new Error('Supply at least one extension for -e option.');
    return true;
}