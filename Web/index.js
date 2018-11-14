import * as d3 from 'd3';
import io from 'socket.io-client';
const socket = io();

let diameter = window.innerWidth * 0.9;

let margin = {
        top: 20,
        right: 120,
        bottom: 20,
        left: 120
    },
    width = window.innerWidth * 0.95,
    height = window.innerHeight;

let i = 0;
let root;
let tree;
let diagonal;
let svg;
let store = [];
let nested;
let selected = undefined;
let selection = {};
let deleted = {};

$(document).ready(function () {
    //if location is ProcessTree
    if (location.href.match(':3000/ProcessTree.html') != null) {
        //Jquery Function that displays list of File path that has been opened in past 1 minutes by retrieving it from ArangoDB
        (function ($) {
            var options = {
                "bProcessing": true,
                "bAutoWidth": false,
                "fnCreatedRow": function (nRow, aData, iDataIndex) {
                    $(nRow).bind('click', 'tr', function (e) {
                        if ($(this).hasClass('selected')) {
                            $(this).removeClass('selected');
                        } else {
                            table.$('tr.selected').removeClass('selected');
                            $(this).addClass('selected');
                        }
                        e.preventDefault();
                    });
                },
                "aoColumns": [{
                    "sTitle": "File Name",
                    "mData": null,
                    "bSortable": false,
                    "bSearchable": true,
                    "sWidth": "800px",
                    "mRender": function (data, type, row, meta) {
                        return data.fileName.replace(/\0/g, '');
                    }
                }, {
                    "sTitle": "File ID",
                    "mData": null,
                    "bSortable": false,
                    "sWidth": "200px",
                    "mRender": function (data, type, row, meta) {
                        return data.fileId;
                    }
                }]
            };

            var table = $(".ProcessTable").dataTable(options);

            let urlParams = new URLSearchParams(window.location.search);
            let myParam = urlParams.get('id');
            $.get('/getProcesses/?id=' + myParam).then(function (data) {
                table.fnClearTable();
                table.fnAddData(data);
            });

            $(".monitor").bind("click", function (e) {
                var rowData2 = table.fnGetData(".selected");
                console.log(rowData2.fileName);
                var fileIdandfileName = [rowData2.fileId, JSON.stringify(rowData2.fileName)];
                window.open("Monitor.html?id=" + fileIdandfileName, "_blank", 'height=724,width=1024,scrollbars=yes');
            });

        })(jQuery);
    }
    //if location is Monitor.html
    if (location.href.match(':3000/Monitor.html') != null) {
        //Jquery Function that query fileName and fileId to display all the past data
        (function ($) {
            var options = {
                "bProcessing": true,
                "bAutoWidth": false,
                "aaSorting": [
                    [1, 'desc']
                ],
                "aoColumns": [{
                    "sTitle": "File Name",
                    "mData": null,
                    "bSortable": false,
                    "sClass": "head0",
                    "bSearchable": true,
                    "sWidth": "600px",
                    "mRender": function (data, type, row, meta) {
                        if (data.fileName != null) {
                            return data.fileName.replace(/\0/g, '');
                        } else {
                            return "--";
                        }
                    }
                }, {
                    "sTitle": "Timestamp",
                    "mData": null,
                    "bSortable": true,
                    "sWidth": "60px",
                    "mRender": function (data, type, row, meta) {
                        if (data.timestamp != null) {
                            return data.timestamp;
                        } else {
                            return "--";
                        }
                    }
                }, {
                    "sTitle": "TypeName",
                    "mData": null,
                    "bSortable": false,
                    "sWidth": "25px",
                    "mRender": function (data, type, row, meta) {
                        if (data.typeName != null) {
                            return data.typeName;
                        } else {
                            return "--";
                        }
                    }
                }]
            };
            //Retrieve value from the URL
            let urlParams = new URLSearchParams(window.location.search);
            let myParam = urlParams.get('id');
            var table = $(".MonitorTable").dataTable(options);
            //Pass it to App.get method in app.js and return back data and add it into the table
            $.get('/QueryFileName/?path=' + myParam).then(function (data) {
                table.fnClearTable();
                table.fnAddData(data);
            });

            var intervalID = null;
            //if user toggle Live Visualization
            //Queries the DB every 5 seconds and updates the table with the latest data
            function intervalManager(flag) {
                if (flag)
                    intervalID = setInterval(() => {
                        $.get('/QueryFileName/?path=' + myParam).then(function (data) {
                            table.fnClearTable();
                            table.fnAddData(data);
                        });
                    }, 5000);
                else
                    clearInterval(intervalID);
            }
            //Jquery Toggle Event on Change. 
            $('#toggle-event').change(function () {
                var isChecked = $(this).prop('checked');
                intervalManager(isChecked);
            });

        })(jQuery);

    }
    //if location is Index.html
    if (document.location == "http://127.0.0.1:3000/") {
        var count = 0;
        var table = $('#dataTable').DataTable();
        setInterval(() => {
            //emit the main socket in app.js every 5 seconds
            socket.emit("IndexPage");
        }, 5000);

        //Method to get number of live machines
        socket.on("TableDatas", (data) => {
            //get the length of redis log to count the number of live logs sending from redis to live visualization
            document.getElementById("divLiveLogs").innerHTML = data.length + " Live Logs";
            for (let i = 0; i < data.length; i++) {
                //Ensure there's no duplicate id
                if (!selection[data[i].id]) {
                    //var count to display on card header "Live Machines"
                    count += 1;
                    selection[data[i].id] = data[i].id;
                    //display it on "live machine" table with each column and hyperlink that redirects them to either visualization or process tree page
                    table.row.add(['<a href="VisualProgger.html?id=' + data[i].id + '">' + convertIntToMac(data[i].id) + '</a>', data[i].platform, data[i].timestamp, '<a href="ProcessTree.html?id=' + data[i].id + '"> Click Here</a>']).draw();
                    document.getElementById("DivLiveComp").innerHTML = count + " Live Machines";
                }
            }
        });
        //socket method to append text on card header of Logs/Min
        socket.on("LogCount", (LogCount) => {
            document.getElementById("divPackets").innerHTML = LogCount + " Logs/Min";
        });

        //socket method to append text on card header of Total Logs
        socket.on("TotalLogs", (TotalLogs) => {
            document.getElementById("DivLogs").innerHTML = TotalLogs + " Total Logs";
        });
        //Chart Query
        $.get('/ChartDataQuery').then(function (data) {

            var graphData = [];
            var labels = [];
            data.forEach(function (element) {
                graphData.push(element.totalPackets);
                labels.push(element.date);
            });

            for (var i = 0; i < labels.length; i++) {
                //make sure we are not checking the last date in the labels array
                if (i + 1 < labels.length) {
                    var date1 = moment(labels[i], "YYYY-MM-DD");
                    var date2 = moment(labels[i + 1], "YYYY-MM-DD");

                    //if the current date +1 is not the same as it's next neighbor we have to add in a new one
                    if (!date1.add(1, "days").isSame(date2)) {

                        //add the label
                        labels.splice(i + 1, 0, date1.format("YYYY-MM-DD"));
                        //add the data
                        graphData.splice(i + 1, 0, 0);
                    }
                }
            }

            new Chart(document.getElementById("myAreaChart"), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: "Total Logs",
                        lineTension: 0.3,
                        backgroundColor: "rgba(2,117,216,0.2)",
                        borderColor: "rgba(2,117,216,1)",
                        pointRadius: 5,
                        pointBackgroundColor: "rgba(2,117,216,1)",
                        pointBorderColor: "rgba(255,255,255,0.8)",
                        pointHoverRadius: 5,
                        pointHoverBackgroundColor: "rgba(2,117,216,1)",
                        pointHitRadius: 50,
                        pointBorderWidth: 2,
                        borderWidth: 2,
                        data: graphData
                    }]
                },
                options: {
                    scales: {
                        xAxes: [{
                            type: 'time',
                            time: {
                                parser: 'YYYY-MM-DD',
                                unit: 'day',
                                displayFormats: {
                                    'day': 'MMM DD',
                                    'week': 'MMM DD',
                                    'month': 'MMM DD',
                                    'quarter': 'MMM DD',
                                    'year': 'MMM DD',
                                },
                                min: moment().subtract(1, "week").format('YYYY-MM-DD'),
                                max: moment().format('YYYY-MM-DD')
                            },
                            ticks: {
                                source: 'data'
                            }
                        }]
                    },
                    legend: {
                        display: false
                    },
                    animation: {
                        duration: 0,
                    }
                }
            });
        });
    }
    //if location is Visualization page
    if (location.href.match(':3000/VisualProgger.html') != null) {
        var handler = null;

        (function ($) {
            $('[data-toggle="tooltip"]').tooltip();

            var handle = null;
            $('#datetimepicker1').datetimepicker({
                format: 'LLL LTS',
                format: "YYYY-MM-DD HH:mm:ss",
                maxDate: moment().format('YYYY-MM-DD HH:mm:ss')
            });

            $('#datetimepicker1').on("change.datetimepicker", function (e) {
                handle = moment(e.date).format('YYYY-MM-DD HH:mm:ss');
            });

            $("#pauseViz").bind("click", function (e) {
                clearInterval(handler);
                $('#toggle-event').prop('checked', false).change();
                console.log("Pause Visualization");
                var test = encodeURIComponent(handle);

                $.get('/VizQuery/?path=' + test).then(function (data) {
                    //check if there's any query returned to be displayed
                    if (data.length > 0){
                        document.getElementById("test").innerHTML = "Data Retrieve Successfully" ;
                        document.getElementById("test").style.color = "green";
                        //empty exisiting array in order to store and display past visualization data
                        store = [];
                        deleteStore();
                        store = store.concat(data);
                        store = removeDuplicates(store);
                        nested = nestTypeName(store);
                        let curNest = getNestFromId(nested, "PSCT_FILE_OPEN");
                        curNest = nest(curNest);
                        for (let item of curNest) {
                            //if computer ID is still same 
                            if (item.key === selected) {
                                draw(renameKeytoName(item));
                            }
                        }
                    }else {
                        document.getElementById("test").innerHTML = "No data found for this Date/Time" ;
                        document.getElementById("test").style.color = "red";

                    }
                });
            });

            var intervalID = null;
            //if user toggle Live Visualization
            //Queries the DB every 5 seconds and updates the table with the latest data
            function intervalManager(flag) {
                if (flag)
                    intervalID = setInterval(() => {
                        socket.emit("get");
                    }, 5000);
                else
                    clearInterval(intervalID);
            }
            //Jquery Toggle Event on Change. 
            $('#toggle-event').change(function () {
                var isChecked = $(this).prop('checked');
                intervalManager(isChecked);
            });
        })(jQuery);


        //Retreive ComputerID after selecting ID from table in index.html
        let urlParams = new URLSearchParams(window.location.search);
        let myParam = urlParams.get('id');
        selected = myParam;
         handler = setInterval(() => {
            socket.emit("get");
        }, 5000);

        socket.on("get", (data) => {
            deleteStore();
            store = store.concat(data);
            store = removeDuplicates(store);
            //Auto Decay to improve performance
            decay();
            //Check if any of checkbox is checked
            //checkCheck();
            nested = nestTypeName(store);
            //Delete Process that has file name PSCT_FILE_CLOSE
            processDeleted(getNestFromId(nested, "PSCT_FILE_CLOSE"));
            if (selected !== undefined && data.length !== 0) {
                let curNest = getNestFromId(nested, "PSCT_FILE_OPEN");
                curNest = nest(curNest);
                for (let item of curNest) {
                    //if computer ID is still same 
                    if (item.key === selected) {
                        draw(renameKeytoName(item));
                    }
                }
            }
        });
    }
    //FTP File Manager
    if (location.href.match(':3000/fileManager.html') != null)  {

        socket.emit("FTPConnStatus");
        //Jquery Function for FTP Connection to Remote Client
        (function ($) {
            var extensionsMap = {
                ".zip": "fa-file-archive",
                ".gz": "fa-file-archive",
                ".bz2": "fa-file-archive",
                ".xz": "fa-file-archive",
                ".rar": "fa-file-archive",
                ".tar": "fa-file-archive",
                ".tgz": "fa-file-archive",
                ".tbz2": "fa-file-archive",
                ".z": "fa-file-archive",
                ".7z": "fa-file-archive",
                ".mp3": "fa-music",
                ".cs": "fa-file-code",
                ".c++": "fa-file-code",
                ".cpp": "fa-file-code",
                ".js": "fa-file-code",
                ".xls": "fa-file-excel",
                ".xlsx": "fa-file-excel",
                ".png": "fa-file-image",
                ".jpg": "fa-file-image",
                ".jpeg": "fa-file-image",
                ".img": "fa-file-image",
                ".gif": "fa-file-image",
                ".mpeg": "fa-file-movie",
                ".pdf": "fa-file-pdf",
                ".ppt": "fa-file-powerpoint",
                ".pptx": "fa-file-powerpoint",
                ".txt": "fa-file-word",
                ".log": "fa-file-word",
                ".doc": "fa-file-word",
                ".docx": "fa-file-word",
                ".old": "fa-file-word",
                ".bin": "fa-file",
                ".exe": "fa-file",
                ".md": "fa-file-alt"
            };

            function getFileIcon(ext) {
                return (ext && extensionsMap[ext.toLowerCase()]) || 'fa-file-signature';
            }

            var currentPath = null;
            var options = {
                "bProcessing": true,
                "bServerSide": false,
                "bPaginate": false,
                "bAutoWidth": false,
                "sScrollY": "550px",
                "fnCreatedRow": function (nRow, aData, iDataIndex) {
                    if (!aData.IsDirectory) return;
                    var path = aData.Path;

                    $(nRow).on('click', 'a', function (e) {
                        $.get('/files?path=' + path).then(function (data) {
                            table.fnClearTable();
                            table.fnAddData(data);
                            currentPath = path;
                            document.getElementById("CurrentDirPath").innerHTML = "Current Path: " + currentPath;
                        });
                        e.preventDefault();
                    });

                    $(nRow).bind('click', 'tr', function (e) {
                        if ($(this).hasClass('selected')) {
                            $(this).removeClass('selected');
                        } else {
                            table.$('tr.selected').removeClass('selected');
                            $(this).addClass('selected');
                        }

                        e.preventDefault();

                    });

                },
                "aoColumns": [{
                    "sTitle": "Name",
                    "mData": null,
                    "bSortable": false,
                    "sClass": "head0",
                    "sWidth": "55px",
                    "mRender": function (data, type, row, meta) {
                        if (data.IsDirectory) {
                            return "<a href='#' target='_blank'><i class='fa fa-folder'></i>&nbsp;" + data.Name + "</a>";
                        } else {
                            return "<a href='/" + data.Path + "' target='_blank'><i class='fa " + getFileIcon(data.Ext) + "'></i>&nbsp;" + data.Name + "</a>";
                        }
                    }
                }, {
                    "sTitle": "File Size",
                    "mData": null,
                    "bSortable": false,
                    "sClass": "head2",
                    "sWidth": "35px",
                    "mRender": function (data, type, row, meta) {
                        if (data.Size != null) {
                            return data.Size;
                        } else {
                            return "--"
                        }

                    }
                }, {
                    "sTitle": "Permission",
                    "mData": null,
                    "bSortable": false,
                    "sClass": "head1",
                    "sWidth": "100px",
                    "render": function (data, type, row, meta) {
                        if (data.permission != null) {
                            return data.permission;
                        } else {
                            return "--"
                        }
                    }
                }]
            };

            var table = $(".linksholder").dataTable(options);

            $.get('/files').then(function (data) {
                table.fnClearTable();
                table.fnAddData(data);
            });
            //Create Folder Icon Button
            $(".makeDir").bind("click", function (e) {
                if (!currentPath) return;
                var dir = prompt("Please enter Folder name", "");
                var testing = [currentPath, dir];
                $.get('/MkDir?path=' + testing).then(function (data) {
                    table.fnClearTable();
                    table.fnAddData(data);
                });
            });
            //Remove Folder Icon Button
            $(".RemoveDir").bind("click", function (e) {
                if (!currentPath) return;
                var rowData2 = table.fnGetData(".selected");

                if (confirm("Are you sure you want to remove " + rowData2.Name)) {
                    $.get('/rmDir?path=' + rowData2.Path).then(function (data) {
                        table.fnClearTable();
                        table.fnAddData(data);
                    });

                } else {
                    console.log("Cancel ")
                }

            });
            //up/previous Icon Button
            $(".up").bind("click", function (e) {
                if (!currentPath) return;
                var idx = currentPath.lastIndexOf("/");
                var path = currentPath.substr(0, idx);
                $.get('/files?path=' + path).then(function (data) {
                    table.fnClearTable();
                    table.fnAddData(data);
                    currentPath = path;
                    document.getElementById("CurrentDirPath").innerHTML = "Current Path: " + currentPath;
                });
            });
        })(jQuery);

        //Connection Status Label
        socket.on("FTPStatus", function (data) {

            document.getElementById("ConnectionStatus").innerHTML = "Connection Status: " + data;
            if (data == "connected") {
                document.getElementById("ConnectionStatus").style.color = "green";
                document.getElementById("loginField").style.display = "none";
                document.getElementById("ToolbarField").style.display = "block";
                document.getElementById("BtnLogout").style.display = "block";
            } else {
                document.getElementById("ConnectionStatus").style.color = "red";
                document.getElementById("ToolbarField").style.display = "none";
            }
        });
    }
});

document.addEventListener("DOMContentLoaded", function () {
    //dropdown onchange load the selected layout
    document.getElementById("ddlViewBy").onchange = function () {
        if (document.getElementById("ddlViewBy").value == "radial") {
            console.log("radial view selected");

            tree = d3.layout.tree()
            .size([360, diameter / 2 - 80 ])
            .separation(function(a, b) { return (a.parent === b.parent ? 1 : 10) / a.depth; });
        
            diagonal = d3.svg.diagonal.radial()
            .projection(function(d) { return [d.y, d.x / 180 * Math.PI]; });
        
          
        } else {
            //hierarchical View
            console.log("hierachical view selected");
            tree = d3.layout.tree().nodeSize([10, 50]);
            diagonal = d3.svg.diagonal()
                .projection(function (d) {
                    return [d.y, d.x];
                });
        }
    }

    tree = d3.layout.tree().nodeSize([10, 50]);

    diagonal = d3.svg.diagonal()
        .projection(function (d) {
            return [d.y, d.x];
        });

    //D3 Framework select Div ID and append SVG 
    svg = d3.select("#D3Diagram").append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("margin", "0 auto")
        .call(d3.behavior.zoom().on("zoom", function () {
            svg.attr("transform", "translate(" + require("d3").event.translate + ")" + " scale(" + require("d3").event.scale + ")")
        }))
        .append("g")
        .attr("transform", "translate(" + window.innerWidth / 2 + "," + window.innerHeight / 2 + ")");
});

//Login Button in fileManager.html
window.SubmitFTPIP = function () {
    var ip = document.getElementById("IPAddress").value;
    var user = document.getElementById("user").value;
    var pass = document.getElementById("pass").value;

    socket.emit('IPAddress', {
        ipAdd: ip,
        username: user,
        password: pass
    });
}
//Logout button in fileManager.html
window.CloseFTPIP = function (e) {
    socket.emit('closeconnection', true);
}

//Remove value not displayed in visualization
function decay() {
    if (Math.floor(store.length * 0.05) !== 0) {
        store.splice(0, Math.floor(store.length * 0.05));
        console.log("Decay deleted " + Math.floor(store.length * 0.05) + " values");
    }
}

function deleteStore() {
    Object.keys(deleted).forEach((list) => {
        for (let i = 0; i < store.length; i++) {
            if (store[i].id === list && deleted[list].includes(store[i].fileId)) {
                store.splice(i, 1);
            }
        }
    })
}

//takes deleted values and append them to list.
function processDeleted(nest) {
    deleted = {};
    let temp = d3.nest().key((d) => {
        return d.id
    }).entries(nest);
    for (let arr of temp) {
        if (!deleted[arr.key]) deleted[arr.key] = [];
        for (let item of arr.values) {
            if (!deleted[arr.key].includes(item.fileId)) {
                deleted[arr.key].push(item.fileId);
            }
        }
    }
}

function getNestFromId(nest, id) {
    for (let item of nest) {
        //id refers to PSCT_FILE_OPEN or PSCT_FILE_CLOSE
        if (item.key === id) {
            return item.values
        }
    }
}

function nestTypeName(list) {
    return d3.nest().key((d) => {
        return d.typeName
    }).entries(list);
}

function nest(item) {
    return d3.nest()
        .key((d) => {
            return d.id
        })
        .key((d) => {
            return d.user
        })
        .key((d) => {
            return d.process
        })
        .key((d) => {
            return d.fileName
        })
        .entries(item);
}

function renameKeytoName(list) {
    list = JSON.stringify(list);
    list = list.replace(/"key":/gi, '"name":');
    list = list.replace(/"values":/gi, '"children":');
    list = JSON.parse(list);
    return list;
}

function draw(list) {
    root = list;
    root.x0 = height;
    root.y0 = 0;
    if (document.getElementById("ddlViewBy").value == "radial") {
        updateRadial(root);
    } else {
        update(root);
    }
}

function removeDuplicates(list) {
    let obj = {};
    for (let i = 0; i < list.length; i++) {
        let item = list[i];
        if (!(obj[item.id + item.user + item.process + item.fileName] &&
                obj[item.id + item.user + item.process + item.fileName].user === item.user &&
                obj[item.id + item.user + item.process + item.fileName].process === item.process &&
                obj[item.id + item.user + item.process + item.fileName].fileName === item.fileName)) {
            obj[item.id + item.user + item.process + item.fileName] = list[i]
        }
    }
    let newArr = [];
    for (var key in obj) newArr.push(obj[key]);
    return newArr;
}

function convertIntToMac(number) {
    return parseInt(number).toString(16);
}

//Radial Tree Diagram
function updateRadial(source) {

    // Compute the new tree layout.
    var nodes = tree.nodes(root),
        links = tree.links(nodes);

    // Normalize for fixed-depth.
    nodes.forEach(function (d) {
        d.y = d.depth * 100;
    });

    // Update the nodes…
    var node = svg.selectAll("g.node")
        .data(nodes, function (d) {
            return d.id || (d.id = ++i);
        });


    // Enter any new nodes at the parent's previous position.
    var nodeEnter = node.enter().append("g")
        .attr("class", "node")
        //.attr("transform", function(d) { return "rotate(" + (d.x - 90) + ")translate(" + d.y + ")"; })
        .on("click", click);

    nodeEnter.append("circle")
        .attr("r", 1e-6)
        .style("fill", function (d) {
            return d._children ? "lightsteelblue" : "#fff";
        });

    nodeEnter.append("text")
        .attr("x", 10)
        .attr("dy", ".35em")
        .attr("text-anchor", "start")
        //.attr("transform", function(d) { return d.x < 180 ? "translate(0)" : "rotate(180)translate(-" + (d.name.length * 8.5)  + ")"; })
        .text(function (d) {
            return d.name;
        })
        .style("fill-opacity", 1e-6)
        .style("fill", function (d) {
            if (d.depth === 3) {
                if (deleted[selected].includes(d.children[0].fileId)) {
                    return "red";
                }
            }
            return "white";
        });

    // Transition nodes to their new position.
    var nodeUpdate = node
        .attr("transform", function (d) {
            return "rotate(" + (d.x - 90) + ")translate(" + d.y + ")";
        })

    nodeUpdate.select("circle")
        .attr("r", 4.5)
        .style("fill", function (d) {
            if (d.depth === 3) {
                if (deleted[selected].includes(d.children[0].fileId)) {
                    return "red";
                }
            }
            return "white";
        });

    nodeUpdate.select("text")
        .style("fill-opacity", 1)
        .attr("transform", function (d) {
            return d.x < 180 ? "translate(0)" : "rotate(180)translate(-" + (d.name.length + 50) + ")";
        });

    var nodeExit = node.exit()
        //.attr("transform", function(d) { return "diagonal(" + source.y + "," + source.x + ")"; })
        .remove();

    nodeExit.select("circle")
        .attr("r", 1e-6);

    nodeExit.select("text")
        .style("fill-opacity", 1e-6);

    // Update the links…
    var link = svg.selectAll("path.link")
        .data(links, function (d) {
            return d.target.id;
        });

    // Enter any new links at the parent's previous position.
    link.enter().insert("path", "g")
        .attr("class", "link")
        .attr("d", function (d) {
            var o = {
                x: source.x0,
                y: source.y0
            };
            return diagonal({
                source: o,
                target: o
            });
        });

    // Transition links to their new position.
    link
        .attr("d", diagonal);

    // Transition exiting nodes to the parent's new position.
    link.exit()
        .attr("d", function (d) {
            var o = {
                x: source.x,
                y: source.y
            };
            return diagonal({
                source: o,
                target: o
            });
        })
        .remove();

    // Stash the old positions for transition.
    nodes.forEach(function (d) {
        d.x0 = d.x;
        d.y0 = d.y;
    });


    // Toggle children on click.
    function click(d) {
        if (d.children) {
            d._children = d.children;
            d.children = null;
        } else {
            d.children = d._children;
            d._children = null;
        }

        updateRadial(d);
    }

    // Collapse nodes
    function collapse(d) {
        if (d.children) {
            d._children = d.children;
            d._children.forEach(collapse);
            d.children = null;
        }
    }
}
//Hierarchical Tree diagram
function update(source) {

    // Compute the new tree layout.
    var nodes = tree.nodes(root).reverse(),
        links = tree.links(nodes);

    // Normalize for fixed-depth.
    nodes.forEach(function (d) {
        d.y = d.depth * 180;
    });

    // Update the nodes…
    var node = svg.selectAll("g.node")
        .data(nodes, function (d) {
            return d.id || (d.id = ++i);
        });

    // Enter any new nodes at the parent's previous position.
    var nodeEnter = node.enter().append("g")
        .attr("class", "node")
        .attr("transform", function (d) {
            return "translate(" + source.y0 + "," + source.x0 + ")";
        })
        .on("click", click);

    /*
    nodeEnter.append("circle")
        .attr("r", 1e-6)
        .style("fill", function (d) {
            return d._children ? "lightsteelblue" : "#fff";
        });*/


    node.append("image")
        .attr("xlink:href", function (d) {

            switch (d.depth) {
                case 0:
                    return "/img/monitor.png";
                case 1:
                    return "/img/user.png";
                case 2:
                    return "/img/process.png";
                case 3:
                    return "/img/folder.png";

            }

        })
        .attr("x", -10)
        .attr("y", -8)
        .attr("width", 16)
        .attr("height", 16);



    //Display Text of each node
    nodeEnter.append("text")
        .attr("x", 5)
        // .attr("x", function (d) {return d.children || d._children ? -5 : 5;}) //fit the circle node
        .attr("dy", ".35em")
        .attr("text-anchor", "start")
        .text(function (d) {
            return d.name;
        })
        .style("fill-opacity", 1e-6)
        .style("fill", function (d) {

            if (d.depth === 3) {
                if (deleted[selected].includes(d.children[0].fileId)) {
                    return "red";
                }
            }
            return "white";
        });

    // Transition nodes to their new position.
    var nodeUpdate = node
        .attr("transform", function (d) {
            return "translate(" + d.y + "," + d.x + ")";
        });

    nodeUpdate.select("circle")
        .attr("r", 5)
        .style("fill", function (d) {
            return d._children ? "lightsteelblue" : "#fff";
        });

    nodeUpdate.select("text")
        .style("fill-opacity", 1);

    // Transition exiting nodes to the parent's new position.
    var nodeExit = node.exit()
        .attr("transform", function (d) {
            return "translate(" + source.y + "," + source.x + ")";
        })
        .remove();

    nodeExit.select("circle")
        .attr("r", 1e-6);

    nodeExit.select("text")
        .style("fill-opacity", 1e-6);

    // Update the links…
    var link = svg.selectAll("path.link")
        .data(links, function (d) {
            return d.target.id;
        });

    // Enter any new links at the parent's previous position.
    link.enter().insert("path", "g")
        .attr("class", "link")
        .attr("d", function (d) {
            var o = {
                x: source.x0,
                y: source.y0
            };
            return diagonal({
                source: o,
                target: o
            });
        });

    // Transition links to their new position.
    link.attr("d", diagonal);

    // Transition exiting nodes to the parent's new position.
    link.exit()
        .attr("d", function (d) {
            var o = {
                x: source.x,
                y: source.y
            };
            return diagonal({
                source: o,
                target: o
            });
        })
        .remove();

    // Stash the old positions for transition.
    nodes.forEach(function (d) {
        d.x0 = d.x;
        d.y0 = d.y;
    });
}

// Toggle children on click.
function click(d) {
    if (d.children) {
        d._children = d.children;
        d.children = null;
    } else {
        d.children = d._children;
        d._children = null;
    }
    update(d);
}


//Unused Code
function checkCheck() {
    //run decay
    if (document.getElementById("decayCheck").checked) {
        if (Math.floor(store.length * 0.05) !== 0) {
            store.splice(0, Math.floor(store.length * 0.05));
            console.log("Decay deleted " + Math.floor(store.length * 0.05) + " values");
        }
    }
    //deleted everything except selected
    if (document.getElementById("deleteCheck").checked) {
        console.log("Delete is Checked, Deleting everything except selected id:" + selected);
        let temp = [];
        for (let item of store) {
            if (item.id === selected) {
                temp.push(item);
            }
        }
        store = temp;
    }
}

function displayComputers(list) {
    for (let i = 0; i < list.length; i++) {
        if (!selection[list[i].id]) {
            selection[list[i].id] = list[i].id;
            let ele = document.createElement("OPTION");
            ele.value = list[i].id;
            ele.appendChild(document.createTextNode(convertIntToMac(list[i].id)));
            document.getElementById("selection").appendChild(ele);
            document.getElementById("selection").onchange = function () {
                selected = document.getElementById("selection").value;
            }
        }
    }
}