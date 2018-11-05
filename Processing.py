import redis
import csv
import sys
import time
import os
import datetime
import json
from struct import unpack
from threading import Thread
from arango import ArangoClient
import re
# Initialize the client for ArangoDB.
client = ArangoClient(protocol='http', host='192.168.133.153', port=8529)

# temp config
redis_Stream = "testingList"
#write logs to csv for testing purposes
write_csv = False
printScreen = True
#compress PSCT_FILE_READ
compress_read = True
#sleep interval between redis requests
sleep_interval = 1
#number of child processes
forks = 2
#redis port
redis_port = "6379"
#reddis ip address
redis_addr = "192.168.133.150" #192.168.133.141

LOG_DB_INSERT = 1

packetTypes = [
    "PSCT_USER_INFO",   # 0
    "PSCT_PROCESS_CREATE",  # 1
    "PSCT_PROCESS_EXIT",  # 2
    "PSCT_FILE_OPEN",  # 3
    "PSCT_FILE_CLOSE",  # 4
    "PSCT_FILE_READ",  # 5
    "PSCT_FILE_WRITE",  # 6
    "PSCT_SOCKET_OPEN", "PSCT_SOCKET_CLOSE", "PSCT_SOCKET_READ", "PSCT_SOCKET_WRITE",
    "PSCT_DIRNODE_CREATE",  # 11
    "PSCT_DIRNODE_DELETE",  # 12
    "PSCT_DIRNODE_RENAME",  # 13
    "PSCT_DIRNODE_LINK",  # 14
    "PSCT_DIRNODE_CHANGE_OWNER",  # 15
    "PSCT_DIRNODE_CHANGE_PERMISSIONS",  # 16
    "PSCT_HANDLE_DUPLICATE",  # 17
    "PSCT_DEBUG"  # 18
]

def main(args):
#Fork processes
    for i in range(forks):
        print '**********%d***********' % i
        pid = os.fork()
        if pid == 0:
            print "%d just was created." % os.getpid()
            process = Process()
            process.start()
        else:
            print "%d just created %d." % (os.getpid(), pid)

class ProggerHeader(object):
    version = 0
    packetLength = 0
    platform = 0
    type = 0
    hostId = 0
    timestamp = 0
    userId = 0
    processId = 0
    attrCount = 0
    timeDelta = 0
    typeName = ""

class Process(object):
    def __init__(self):
        #self.count = 0
        self.redis = redis.StrictRedis(host=redis_addr, port=redis_port)
        self.processed = 0
        self.PSCT_USER_INFO = 0
        self.PSCT_FILE_OPEN = 0
        self.PSCT_FILE_CLOSE = 0
        self.PSCT_FILE_READ = 0
        self.PSCT_FILE_WRITE = 0
        self.PSCT_HANDLE_DUPLICATE = 0
        self.PSCT_DIRNODE_LINK = 0
        self.PSCT_DIRNODE_DELETE = 0
        self.PSCT_DIRNODE_CHANGE_OWNER = 0
        self.PSCT_DIRNODE_CHANGE_PERMISSIONS = 0
        self.PSCT_DIRNODE_RENAME = 0
        self.PSCT_DIRNODE_CREATE = 0
        self.PSCT_USER_INFO = 0
        self.PSCT_PROCESS_CREATE = 0
        self.PSCT_PROCESS_EXIT = 0
        self.filenameExamples = ""
        self.fileOpenExamples = ""
        self.csvBuffer = []
        self.Buffer_DB = []
        self.Buffer_PSCT_FILE_READ = []

    def listener(self):
        while True:
            pipeline = self.redis.pipeline()
            curLen = self.redis.llen(redis_Stream)
            if curLen == 0:
                time.sleep(sleep_interval)
                continue
            if curLen < 10000:
                pipeline.lrange(redis_Stream, 0, curLen)
                pipeline.ltrim(redis_Stream, curLen,-1)
            else:
                pipeline.lrange(redis_Stream, 0, 10000)
                pipeline.ltrim(redis_Stream, 10000, -1)
            result = pipeline.execute()
            for x in result[0]:
                self.process_line(x)
            time.sleep(sleep_interval)
    #unpacks the data
    def process_line(self, line):
        header = ProggerHeader()
        version, = unpack("=B", line[:1])
        #check version
        if not version == 0:
            if version == 100:
                #extract header
                platform, = unpack("=B", line[3:4])
                #if Platform = 0 = Windows
                if platform == 0:
                    header.version, header.packetLength, header.platform, header.type, header.hostId, header.timestamp, header.userId, header.processId, header.attrCount, header.timeDelta = unpack(
                    "=BHBBIQIIBQ", line[:34])
                    header.timestamp = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(header.timestamp/1000))
                    PayloadPlatform = "Windows"
                elif platform == 1:
                    header.version, header.packetLength, header.platform, header.type, header.hostId, header.timestamp, header.userId, header.processId, header.attrCount, header.timeDelta = unpack(
                    "=BHBBQQIIBQ", line[:38])
                    header.timestamp = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(header.timestamp/1000000000))
                    PayloadPlatform = "Linux"
                else:
                    return None
                header.typeName = packetTypes[header.type]
            else:
                return None

        if len(line) != header.packetLength:
            print("line length mismatch")
            return None

        #if header is not file read
        if header.typeName != "PSCT_FILE_READ":
            if self.Buffer_PSCT_FILE_READ.__len__() is not 0:
                fileHandleId, fileId, position, length = self.proc_PSCT_FILE_READ_BUFFER()
                self.send_PSCT_FILE_READ(fileHandleId, fileId, position, length)

        #Added 5 additional item into payload
        #Add timestamp into payload and convert to readable format.
        payload = {
            "id": str(header.hostId),
            "user": str(header.userId),
            "process": str(header.processId),
            "timestamp": str(header.timestamp),
            "platform": str(PayloadPlatform)
        }

        if header.platform == 0:

            #PSCT_FILE_OPEN
            if header.typeName == "PSCT_FILE_OPEN":
                self.PSCT_FILE_OPEN += 1
                fileHandleId, fileId, filenameLength = unpack("=QQH", line[36:54])
                #fileName is inserted into DB with an extra space /u0000 thus the -1 in the filename
                fileName = str(line[59:59+filenameLength - 1])
                if fileName is not None:
                    self.fileOpenExamples = fileName

                try:
                    payload["typeName"] = str(header.typeName)
                    payload["fileName"] = fileName.decode('unicode-escape')
                    payload["fileId"] = str(fileId)
                    self.Buffer_DB.append(payload)
                except:
                    print("file open, filename error")
                    pass
                    
            #PSCT_FILE_CLOSE
            if header.typeName == "PSCT_FILE_CLOSE":
                self.PSCT_FILE_CLOSE += 1
                fileHandleId, fileId = unpack("=QQ", line[36:])
                if write_csv:
                    self.csvBuffer.append(["PSCT_FILE_CLOSE", "fileHandleID: " + str(fileHandleId), "fileId" + str(fileId)])
                payload["typeName"] = str(header.typeName)
                payload["fileId"] = str(fileId)
                self.Buffer_DB.append(payload)
            
            #PSCT_FILE_READ
            #Lots of duplicate with different position and length
            if header.typeName == "PSCT_FILE_READ":
                self.PSCT_FILE_READ += 1
                fileHandleId, fileId, position, length = unpack("=QQqQ", line[36:])
                if compress_read:
                    if self.Buffer_PSCT_FILE_READ.__len__() is 0 or (self.Buffer_PSCT_FILE_READ[0][4] == header.processId and self.Buffer_PSCT_FILE_READ[0][0] == fileHandleId and self.Buffer_PSCT_FILE_READ[0][1] == fileId):
                        self.Buffer_PSCT_FILE_READ.append([fileHandleId, fileId, position, length, header.processId])
                    else:
                        _fileHandleId, _fileId, _position, _length = self.proc_PSCT_FILE_READ_BUFFER()
                        _AfileHandleId, _AfileId, _Aposition, _Alength = self.send_PSCT_FILE_READ(_fileHandleId,_fileId,_position,_length)
                        self.Buffer_PSCT_FILE_READ.append([fileHandleId, fileId, position, length, header.processId])
                        payload["typeName"] = str(header.typeName)
                        payload["fileId"] = str(_AfileId)
                        payload["position"] = str(_Aposition)
                        payload["length"] = str(_Alength)
                        #self.Buffer_DB.append(payload)
                else:
                    self.send_PSCT_FILE_READ(fileHandleId, fileId, position, length)
            
            #PSCT_FILE_WRITE
            #Lots of duplicate with different position and length
            if header.typeName == "PSCT_FILE_WRITE":
                self.PSCT_FILE_WRITE += 1
                fileHandleId, fileId, position, length = unpack("=QQqQ", line[36:])
                if write_csv:
                    self.csvBuffer.append(["PSCT_FILE_WRITE", "fileHandleID: " + str(fileHandleId), "fileId: " + str(fileId),
                                    "position: " + str(position), "length: " + str(length)])
                payload["typeName"] = str(header.typeName)
                payload["fileId"] = str(fileId)
                self.Buffer_DB.append(payload)
            
            #PSCT_DIRNODE_CREATE
            #Display filename of the original name (New Folder) instead of the name you changed it to.
            if header.typeName == "PSCT_DIRNODE_CREATE":
                self.PSCT_DIRNODE_DELETE += 1
                filenameLength = unpack("=H", line[36:38])
                fileName = line[39:]
                if fileName is not None:
                    self.filenameExamples = fileName
                if write_csv:
                    self.csvBuffer.append(["PSCT_DIRNODE_DELETE", "filenameLength: " + str(filenameLength), "filename: " + str(fileName.decode('unicode-escape'))])
                payload["typeName"] = str(header.typeName)
                payload["fileName"] = fileName.decode('unicode-escape')
                self.Buffer_DB.append(payload)
            
            #PSCT_DIRNODE_DELETE
            if header.typeName == "PSCT_DIRNODE_DELETE":
                self.PSCT_DIRNODE_DELETE += 1
                filenameLength = unpack("=h", line[36:38])
                fileName = line[39:]
                if fileName is not None:
                    self.filenameExamples = fileName
                if write_csv:
                    self.csvBuffer.append(["PSCT_DIRNODE_DELETE", "filenameLength: " + str(filenameLength), "filename: " + str(fileName)])
                payload["typeName"] = str(header.typeName)
                payload["fileName"] = fileName.decode('unicode-escape')
           
                self.Buffer_DB.append(payload)
            
            #PSCT_DIRNODE_RENAME
            if header.typeName == "PSCT_DIRNODE_RENAME":
                self.PSCT_DIRNODE_RENAME += 1
                oldFilenameLength, newFilenameLength = unpack("=HH", line[36:40])
                oldFileName = line[41:41+oldFilenameLength]
                newFilename = line[41+oldFilenameLength:41+oldFilenameLength+newFilenameLength]
                if write_csv:
                    self.csvBuffer.append(["PSCT_DIRNODE_RENAME", "fileName: " + str(oldFileName), "newFileName: " + str(newFilename)])
                payload["typeName"] = header.typeName
                payload["fileName"] = oldFileName
                payload["newFileName"] = newFilename
                self.Buffer_DB.append(payload)

            #PSCT_DIRNODE_LINK
            if header.typeName == "PSCT_DIRNODE_LINK":
                self.PSCT_DIRNODE_LINK += 1
                oldFilenameLength, newFilenameLength = unpack("=HH", line[36:40])
                oldFileName = line[40:40+oldFilenameLength]
                newFilename = line[40+oldFilenameLength:40+oldFilenameLength+newFilenameLength]
                #if write_csv:
                #    self.csvBuffer.append(["PSCT_DIRNODE_LINK", "oldFilenameLength: " + str(oldFilenameLength), "newFilenameLength" + str(newFilenameLength), "oldFilename: " + oldFileName, "newFilename: " + newFilename])
                payload["typeName"] = header.typeName
                payload["fileName"] = oldFileName.decode('unicode-escape')
                payload["newFileName"] = newFilename.decode('unicode-escape')
                self.Buffer_DB.append(payload)
                
            #PSCT_DIRNODE_CHANGE_OWNER
            #not sure how to trigger this log
            if header.typeName == "PSCT_DIRNODE_CHANGE_OWNER":
                self.PSCT_DIRNODE_CHANGE_OWNER += 1
                fileHandleId, fileId, newOwnerId, sidLength = unpack("=QQIH", line[36:58])
                #if write_csv:
                #    self.csvBuffer.append(["PSCT_DIRNODE_CHANGE_OWNER", "fileHandleId: " + str(fileHandleId), "fileId: " + str(fileId), "filenameLength: " + str(filenameLength), "newOwnerId: " + str(newOwnerId), "sidLength: " + str(sidLength)])

            #PSCT_DIRNODE_CHANGE_PERMISSIONS
            if header.typeName == "PSCT_DIRNODE_CHANGE_PERMISSIONS":
                self.PSCT_DIRNODE_CHANGE_PERMISSIONS += 1
                fileName = line[38:]
                payload["typeName"] = str(header.typeName)
                payload["fileName"] = fileName.decode('unicode-escape')
                self.Buffer_DB.append(payload)

        else:
            # PSCT_FILE_OPEN
            if header.typeName == "PSCT_FILE_OPEN":
                self.PSCT_FILE_OPEN += 1
                fileHandleId, fileId, created, filenameLength, securityLength = unpack("=QQ?HI", line[40:63])
                fileName = str(line[63:63+filenameLength])
            
                if fileName is not None:
                    self.fileOpenExamples = fileName
                if write_csv:
                    self.csvBuffer.append(["PSCT_FILE_OPEN", "fileHandleId: "+str(fileHandleId), "fileId: " + str(fileId), "created: " + str(created), "filenameLength: "+ str(filenameLength), "securityLength: " + str(securityLength), "fileName: " + fileName])
                payload["typeName"] = str(header.typeName)
                payload["fileName"] = str(fileName)
                payload["fileId"] = str(fileId)
                self.Buffer_DB.append(payload)

            # PSCT_FILE_CLOSE
            if header.typeName == "PSCT_FILE_CLOSE":
                self.PSCT_FILE_CLOSE += 1
                fileHandleId, fileId = unpack("=QQ", line[40:])
                if write_csv:
                    self.csvBuffer.append(["PSCT_FILE_CLOSE", "fileHandleID: " + str(fileHandleId), "fileId" + str(fileId)])
                payload["typeName"] = str(header.typeName)
                payload["fileId"] = str(fileId)
                self.Buffer_DB.append(payload)

            # PSCT_FILE_READ
            if header.typeName == "PSCT_FILE_READ":
                self.PSCT_FILE_READ += 1
                fileHandleId, fileId, position, length = unpack("=QQqQ", line[40:])
                if compress_read:
                    if self.Buffer_PSCT_FILE_READ.__len__() is 0 or (self.Buffer_PSCT_FILE_READ[0][4] == header.processId and self.Buffer_PSCT_FILE_READ[0][0] == fileHandleId and self.Buffer_PSCT_FILE_READ[0][1] == fileId):
                        self.Buffer_PSCT_FILE_READ.append([fileHandleId, fileId, position, length, header.processId])
                    else:
                        _fileHandleId, _fileId, _position, _length = self.proc_PSCT_FILE_READ_BUFFER()
                        _AfileHandleId, _AfileId, _Aposition, _Alength =  self.send_PSCT_FILE_READ(_fileHandleId,_fileId,_position,_length)
                        self.Buffer_PSCT_FILE_READ.append([fileHandleId, fileId, position, length, header.processId])
                        payload["typeName"] = str(header.typeName)
                        payload["fileId"] = str(_AfileId)
                        payload["position"] = str(_Aposition)
                        payload["length"] = str(_Alength)
                        self.Buffer_DB.append(payload)      
                else:
                    self.send_PSCT_FILE_READ(fileHandleId, fileId, position, length)
           
            # PSCT_FILE_WRITE
            if header.typeName == "PSCT_FILE_WRITE":
                self.PSCT_FILE_WRITE += 1
                fileHandleId, fileId, position, length = unpack("=QQqQ", line[40:])
                if write_csv:
                    self.csvBuffer.append(["PSCT_FILE_WRITE", "fileHandleID: " + str(fileHandleId), "fileId: " + str(fileId),
                                    "position: " + str(position), "length: " + str(length)])
                payload["typeName"] = str(header.typeName)
                payload["fileId"] = fileId
                self.Buffer_DB.append(payload)
            
            # PSCT_DIRNODE_CREATE
            if header.typeName == "PSCT_DIRNODE_CREATE":
                self.PSCT_DIRNODE_CREATE += 1
                filenameLength = unpack("=H", line[40:42])
                filename = line[40:]
                #self.filenameExamples = filename
                if write_csv:
                    self.csvBuffer.append(["PSCT_DIRNODE_CREATE", "filenameLength: " + str(filenameLength), "filename: " + str(filename)])
                payload["typeName"] = str(header.typeName)
                payload["fileName"] = str(filename)

            # PSCT_DIRNODE_DELETE
            if header.typeName == "PSCT_DIRNODE_DELETE":
                self.PSCT_DIRNODE_DELETE += 1
                filenameLength = unpack("=H", line[40:42])
                filename = line[42:]
                if filename is not None:
                    self.filenameExamples = filename
                if write_csv:
                    self.csvBuffer.append(["PSCT_DIRNODE_DELETE", "filenameLength: " + str(filenameLength), "filename: " + str(filename)])
                payload["typeName"] = header.typeName
                payload["fileName"] = str(filename)
                self.Buffer_DB.append(payload)
        
            # PSCT_DIRNODE_RENAME
            if header.typeName == "PSCT_DIRNODE_RENAME":
                self.PSCT_DIRNODE_RENAME += 1
                oldfilenameLength ,newfilenameLength= unpack("=HH", line[40:44])
                oldFilename = line[44:44+oldfilenameLength]
                newFilename = line[44+oldfilenameLength:44+oldfilenameLength+newfilenameLength]
                payload["typeName"] = str(header.typeName)
                payload["fileName"] = str(oldFilename)
                payload["newFileName"] = str(newFilename)
                self.Buffer_DB.append(payload)
            
            # PSCT_DIRNODE_LINK
            if header.typeName == "PSCT_DIRNODE_LINK":
                self.PSCT_DIRNODE_LINK += 1
                oldFilenameLength, newFilenameLength = unpack("=HH", line[40:48])
                oldFileName = line[48:48+oldFilenameLength]
                newFilename = line[48+oldFilenameLength:48+oldFilenameLength+newFilenameLength]
                if write_csv:
                    self.csvBuffer.append(["PSCT_DIRNODE_LINK", "oldFilenameLength: " + str(oldFilenameLength), "newFilenameLength" + str(newFilenameLength), "oldFilename: " + oldFileName, "newFilename: " + newFilename])
                
                payload["typeName"] = header.typeName
                payload["fileName"] = str(oldFileName)
                payload["newFileName"] = str(newFilename)
                self.Buffer_DB.append(payload)


            # PSCT_DIRNODE_CHANGE_OWNER
            if header.typeName == "PSCT_DIRNODE_CHANGE_OWNER":
                self.PSCT_DIRNODE_CHANGE_OWNER += 1
                fileHandleId, fileId, filenameLength, newOwnerId, sidLength = unpack("=QQHIH", line[40:64])
                #fileHandleId, fileId, newOwnerId, sidLength = unpack("=QQIH", line[40:62])
                print(header.typeName)
                print("Size" , len(line[:]))
                print("filenam lnegth", filenameLength)
                print("FilehandleID" , fileHandleId)
                print("FileID" , fileId)
                print("owner ID" , newOwnerId)
                print("SID Length" , sidLength)
                print(line[60:])
                #5 BYTES FROM WHERE FOR WHAT??
                if write_csv:
                    self.csvBuffer.append(["PSCT_DIRNODE_CHANGE_OWNER", "fileHandleId: " + str(fileHandleId), "fileId: " + str(fileId), "filenameLength: " + str(filenameLength), "newOwnerId: " + str(newOwnerId), "sidLength: " + str(sidLength)])

            # PSCT_DIRNODE_CHANGE_PERMISSIONS
            if header.typeName == "PSCT_DIRNODE_CHANGE_PERMISSIONS":
                self.PSCT_DIRNODE_CHANGE_PERMISSIONS += 1
                fileHandleId, fileId, mode, filenameLength = unpack("=QQHH", line[40:60])
                filename = line[60:]
                if write_csv:
                    self.csvBuffer.append(["PSCT_DIRNODE_CHANGE_PERMISSIONS", "fileHandleId: " + str(fileHandleId), "fileId: " + str(fileId), "mode: "+ str(mode), "filenameLength: "+ str(filenameLength), "filename: " + str(filename)])
                payload["typeName"] = str(header.typeName)
                payload["fileName"] = str(filename)
                self.Buffer_DB.append(payload)

            # PSCT_HANDLE_DUPLICATE
            if header.typeName == "PSCT_HANDLE_DUPLICATE":
                self.PSCT_HANDLE_DUPLICATE += 1
                oldfileHandleId, oldfileId, newfileHandleId, newfileId, type = unpack("=QQQQB", line[40:])
                if write_csv:
                    self.csvBuffer.append(["PSCT_HANDLE_DUPLICATE", "oldfileHandleId: " + str(oldfileHandleId), "oldfileId: " + str(oldfileId), "newfileHandleId: "+ str(newfileHandleId), "newfileId: " + str(newfileId), "type: " + str(type)])

    def send_PSCT_FILE_READ(self, fileHandleId, fileId, position, length):
        if write_csv:
            self.csvBuffer.append(["PSCT_FILE_READ", "fileHandleID: " + str(fileHandleId), "fileId: " + str(fileId),"position: " + str(position), "length: " + str(length)])
        
        return fileHandleId, fileId, position, length

        
    def proc_PSCT_FILE_READ_BUFFER(self):
        if self.Buffer_PSCT_FILE_READ.__len__() is not 0:
            fileHandleId = self.Buffer_PSCT_FILE_READ[0][0]
            fileId = self.Buffer_PSCT_FILE_READ[0][1]
            position = self.Buffer_PSCT_FILE_READ[0][2]
            length = 0
            for item in self.Buffer_PSCT_FILE_READ:
                length += self.Buffer_PSCT_FILE_READ.pop(0)[3]
            return fileHandleId, fileId, position, length
        return


    def start(self):
        listener = Thread(target=self.listener)
        listener.start()
        if write_csv:
            write2csv = Thread(target=self.write_to_csv)
            write2csv.start()

        write2db = Thread(target=self.write_to_db)
        write2db.start()

    #Insertion of data for Visual Progger into Redis as Buffer for live visualization and ArangoDB for data persistence
    def write_to_db(self):
        while True:
            if self.Buffer_DB.__len__() is not 0:
                #Connect to "visualprogger" database and "live" Collection from visualprogger database
                livedata = client.db('visualprogger', username='root', password='1234').collection('live')
             
                #Remove duplicate objects and append to new List
                newList = []
                for e in self.Buffer_DB:
                    if e not in newList:
                        newList.append(e)

                #Clone Deduplicated Array into Buffer_DB pass data into DB for persistence
                self.Buffer_DB = newList[:]

                try:
                    if LOG_DB_INSERT == 1:
                        start = time.time()
                        print "Inserting into arangoDB. Length: ", len(newList[:])
                        livedata.import_bulk(newList[:])
                        end = time.time()
                        print "time elapsed: " , end - start
                    else:
                        livedata.import_bulk(newList[:])

                except:
                    print("Erorr in insertion")
                
                pipeline = self.redis.pipeline() 
                for x in self.Buffer_DB:
                    try:
                        pipeline.rpush("dbBuffer",json.dumps(self.Buffer_DB.pop(0)))
                    except:
                        print("Error caught")
                pipeline.execute()
            time.sleep(sleep_interval)
   
    #save logs as csv file
    def write_to_csv(self):
        with open("log.csv", "wb") as csvfile:
            writer = csv.writer(csvfile, delimiter=" ", quotechar=',', quoting=csv.QUOTE_MINIMAL)
            while True:
                if self.csvBuffer.__len__() is not 0:
                    _ = self.csvBuffer.pop(0)
                    writer.writerow(_)


if __name__ == "__main__":
    main(sys.argv)
