app.get("/UploadFile", function (req, res) {
    var query = req.query.path || '';
    var e = query.split(",");

    var idx = query.lastIndexOf("/");
    var Namingpath = query.substr(idx);
    if (ftp.getConnectionStatus() == "connected") {
        x.then(function () {

            ftp.put(e[1], "/" + e[0] + "/tttt").catch(error => {
                console.log("Occur within upload statement \n" + error);
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



                <span class="UploadFile">
                  <input id='fileid' type='file' hidden />
                  <i class="fa fa-upload"></i> Upload Files
                </span>



     /*
            $(nRow).bind("click", function (e) {
                $.get('/files?path=' + path).then(function (data) {
                    table.fnClearTable();
                    table.fnAddData(data);
                    currentPath = path;
                    document.getElementById("CurrentDirPath").innerHTML = "Current Path: " + currentPath;
                });
                e.preventDefault();
            });
*/


























const MongoClient = require('mongodb').MongoClient;

//var mongoURL = "mongodb://172.16.216.140:27017/";



/*           
        userCollection.all().then(
            cursor => cursor.map(doc => doc._key)
          ).then(
            keys => console.log('All keys:', keys.join(', ')),
            err => console.error('Failed to fetch all documents:', err)
          );
     
        db.query({
            query: "RETURN LENGTH('live')",
            bindVars: { value: now }
          })
            .then(function(cursor) {
              return cursor.next().then(function(result) {
                console.log(result);
            });
            })
            .catch(function(err) {
              // ...
            });

        MongoClient.connect(mongoURL, {useNewUrlParser: true}, function (err, db) {
            if (err) throw err;
            var dbo = db.db("visualprogger");
            dbo.collection("live").countDocuments(function (err, res) {
                if (err) throw err;
                socket.emit("TotalLogs", res);
                db.close();
            });

        });

        MongoClient.connect(mongoURL,  { useNewUrlParser: true }, function (err, db) {
            if (err) throw err;
            var dbo = db.db("visualprogger");
            var query = { timestamp: /26-09-2018 15:/, typeName: 'PSCT_FILE_OPEN' };
            dbo.collection("live").find(query).toArray(function(err, result) {
                if (err) throw err;
                socket.emit("Test", result)
                db.close();
            });
        });
               
*/


/*
app.get('/files', function (req, res) {
    var currentDir = dir;
    var query = req.query.path || '';
    if (query) currentDir = path.join(dir, query);
    console.log("browsing ", currentDir);
    fs.readdir(currentDir, function (err, files) {
        if (err) {
            throw err;
        }
        var data = [];
        files
            .filter(function (file) {
                return true;
            })
            .forEach(function (file) {
                try {
                    //console.log("processing ", file);
                    var isDirectory = fs.statSync(path.join(currentDir, file)).isDirectory();
                    if (isDirectory) {
                        data.push({
                            Name: file,
                            IsDirectory: true,
                            Path: path.join(query, file)
                        });
                    } else {
                        var ext = path.extname(file);
                        if (argv.exclude && _.contains(argv.exclude, ext)) {
                            console.log("excluding file ", file);
                            return;
                        } else if (argv.include && !_.contains(argv.include, ext)) {
                            console.log("not including file", file);
                            return;
                        }
                        data.push({
                            Name: file,
                            Ext: ext,
                            IsDirectory: false,
                            Path: path.join(query, file)
                        });
                    }

                } catch (e) {
                    console.log(e);
                }

            });
        data = _.sortBy(data, function (f) {
            return f.Name
        });
        res.json(data);
    });
});


 */
















function sortFileOpen(list) {
    let temp = {};
    for (let i = 0; i < list.length; i++) {
        if (list[i].typeName === "PSCT_FILE_OPEN") {
            let item = list[i];
            if (temp[item.user] == null) {
                temp[item.user] = {}
                temp[item.user][item.process] = {}
                temp[item.user][item.process][item.fileName] = {}
            } else {
                if (temp[item.user][item.process] == null) {
                    temp[item.user][item.process] = {}
                    temp[item.user][item.process][item.fileName] = {}
                } else {
                    if (temp[item.user][item.process][item.fileName] == null) {
                        temp[item.user][item.process][item.fileName] = {};
                    }
                }
            }
        }
    }

    return temp;
}

function sortById(list) {
    let temp = {};
    for (let i = 0; i < list.length; i++) {
        let item = JSON.parse(list[i]);
        if (temp[item.id] == null) {
            temp[item.id] = [];
            temp[item.id].push(item);
        } else {
            temp[item.id].push(item)
        }
    }
    return temp;
}








    "datatables.net": "^1.10.19",
    "datatables.net-dt": "^1.10.19",






Processing.py Deleted Code------------------------------------------------------
#from pymongo import MongoClient


        #connection = MongoClient('172.16.216.140', 27017)
        #Connects to db name visualprogger
        #db = connection['visualprogger']
        #db = conn["visualprogger"]
        #db["live"]



                    #db['live'].insert_one(copyofBuffer.pop(0))

