'use strict';

// Load modules
const electron = require('electron');
const fs = require('file-system');
const configuration = require('./configuration');
const DOMParser = require('xmldom').DOMParser;
const XMLSerializer = require('xmldom').XMLSerializer;
const moment = require('moment');
// const xmlValidator = require('libxml-xsd'); // TODO: REMOVED due to compile issues

const app = electron.app;           // Module to control application life.
const shell = electron.shell;       // Electron's shell module which provides desktop integration
const ipcMain = electron.ipcMain;   // Electron's Inter Processes Communication: event-driven messaging
const dialog = electron.dialog;     // Electron's dialog module
const BrowserWindow = electron.BrowserWindow;   // Module to create native browser window.

// App-related variables
const __sbg_io_dir = getDirSeparator() + 'sbg-xml-io';
var __default_input_dir = __sbg_io_dir + getDirSeparator() + 'input';
var __default_output_dir = __sbg_io_dir + getDirSeparator() + 'output';

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;
// Re-assignable window objects
var settingsWindow = null;
var settingsWebContent = null;
var isMerging = false;
var isInitialSubmission = false;
var isValidateXml = false;
const FILE_ENCODING = 'UTF8';
const FILE_TYPE_XML = 'application/xml';
const XML_DECLARATION = '<?xml version="1.0" encoding="utf-8"?>';

// ----------------------------- Event listeners ----------------------------- //
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', onAppReady);

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createMainWindow();
    }
});

ipcMain.on('open-settings-window', function () {
    if (settingsWindow) {
        return;
    }

    settingsWindow = new BrowserWindow({
        width: 800,
        height: 420,
        frame: false,
        resizable: true,
        alwaysOnTop: true
    });

    settingsWindow.loadURL('file://' + __dirname + '/settings.html');
    settingsWebContent = settingsWindow.webContents;

    settingsWindow.on('closed', function () {
        settingsWindow = null;
        settingsWebContent = null;
    });
});

ipcMain.on('close-settings-window', function () {
    closeSettingsWindow();
});

ipcMain.on('open-dialog-input-dir', function (event, args) {
    onOpenDialogInputDir();
});

ipcMain.on('open-dialog-output-dir', function (event, args) {
    onOpenDialogOutputDir();
});

ipcMain.on('open-dialog-xsd-file', function (event, args) {
    onOpenDialogXsdFile();
});

ipcMain.on('do-reset-settings', function (event, args) {
    resetUserSettings();
});

ipcMain.on('do-merge-files', function (event, args) {
    mergeFiles(args);
});

ipcMain.on('show-input-dir', function (event, args) {
    showDirectory(getUserDefinedPathOrDesktop('inputDir'));
});

ipcMain.on('show-output-dir', function (event, args) {
    var showDir = masterSbgObj.fullpath;
    if (!showDir) {
        showDir = getUserDefinedPathOrDesktop('outputDir');
    }
    showDirectory(showDir);
});

ipcMain.on('toggle-exclude-attributes', function (event, args) {
    setExcludeAttributes(args);
});

ipcMain.on('toggle-initial-submission', function (event, args) {
    setInitialSubmission(args);
    var incr = "yes" === args ? 50 : -50;
});

ipcMain.on('toggle-validate-xml', function (event, args) {
    setValidateXml(args);
    var incr = "yes" === args ? 50 : -50;
});

ipcMain.on('update-care-giver-name', function (event, args) {
    setMasterCareGiverName(args);
});

ipcMain.on('update-care-giver-code', function (event, args) {
    setMasterCareGiverCode(args);
});


// -------------------------------------------------------------------------- //


// ----------------------------- Main functions ----------------------------- //
function onAppReady() {
    // update default directories
    __default_input_dir = getUserDesktopPath() + __default_input_dir;
    __default_output_dir = getUserDesktopPath() + __default_output_dir;

    // inits
    // todo fajar: retain configs of previous sessions?
    createDefaultDirectories();
    setExcludeAttributes("no");
    setValidateXml("no");
    setXsdFile("");
    setInitialSubmission("no");
    setMasterCareGiverName("");
    setMasterCareGiverCode("");

    createMainWindow();
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 640,
        resizable: true,
        frame: true
    });

    // and load the index.html of the app.
    mainWindow.loadURL('file://' + __dirname + '/index.html');

    // Open the DevTools when parameter --devTools is passed from CLI
    if (process.env.npm_config_devTools) {
        mainWindow.webContents.openDevTools();
    }

    // Emitted when the window is closed.
    mainWindow.on('closed', function () {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });

    // console.log("Name: " + app.getName() + ", Version: " + app.getVersion());
    // console.log("App is ready!!");
    // intercept external links
    mainWindow.webContents.on('new-window', function (e, url) {
        e.preventDefault();
        shell.openExternal(url);
    });
}

// check settings and create input/output directories if they don't exist yet
function createDefaultDirectories() {
    // input dir
    setInputDirectory(__default_input_dir);
    makeDirectory(__default_input_dir);

    // output dir
    setOutputDirectory(__default_output_dir);
    makeDirectory(__default_output_dir);
}

function closeSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.close();

        // check settings
        checkSettingsForValidateXml();
        checkSettingsForInitialSubmission();
    }
}

function checkSettingsForValidateXml() {
    // show a warning when no XSD file is found when user wants the output XML to be validated
    if (isValidateXml && !isXsdFileSelected()) {
        showWarning(
            "You have selected to validate the XML file, but there's no XSD file selected.",
            "Open Settings and select a XSD file, or disable validation."
        );
        sendLogMessage("Warning: no XSD file selected");
    }
}

function checkSettingsForInitialSubmission() {
    // show a warning when no valid name or code is found for the Caregiver
    // when user wants to create a XML file for initial submission
    if (isInitialSubmission) {
        if (!isValidCareGiverName()) {
            showWarning(
                "You have selected to create an XML file for initial submission, but the Caregiver's name is not valid",
                "Open Settings and enter a valid name for the Caregiver."
            );
            sendLogMessage("Warning: invalid Caregiver\'s name");
        } else if (!isValidCareGiverCode()) {
            showWarning(
                "You have selected to create an XML file for initial submission, but the Caregiver's code is not valid",
                "Open Settings and enter a valid code for the Caregiver."
            );
            sendLogMessage("Warning: invalid Caregiver\'s code");
        }
    }
}

function onOpenDialogInputDir() {
    var path = getUserDefinedPathOrDesktop('inputDir');
    console.log("Opening input path: " + path);
    dialog.showOpenDialog({defaultPath: path, properties: ['openDirectory']}, callbackOpenDialogInputDir);
}

function onOpenDialogOutputDir() {
    var path = getUserDefinedPathOrDesktop('outputDir');
    console.log("Opening output path: " + path);
    dialog.showOpenDialog({defaultPath: path, properties: ['openDirectory']}, callbackOpenDialogOutputDir);
}

function onOpenDialogXsdFile() {
    var path = getUserDefinedPathOrDesktop('xsdFile');
    console.log("Selecting XSD file: " + path);
    dialog.showOpenDialog(
        {defaultPath: path, properties: ['openFile'], filters: [{name: 'XSD', extensions: ['xsd']}]},
        callbackOpenDialogXsdFile
    );
}

function callbackOpenDialogInputDir(obj) {
    if (!obj) {
        return;
    }

    var path = obj[0];
    if (path !== undefined) {
        setInputDirectory(path);
        notifyUpdateSettings();
    }
}

function callbackOpenDialogOutputDir(obj) {
    if (!obj) {
        return;
    }

    var path = obj[0];
    if (path !== undefined) {
        setOutputDirectory(path);
        notifyUpdateSettings();
    }
}

function callbackOpenDialogXsdFile(obj) {
    if (!obj) {
        return;
    }

    var path = obj[0];
    if (path !== undefined) {
        setXsdFile(path);
        notifyUpdateSettings();
    }
}

function setInputDirectory(path) {
    configuration.saveSettings('inputDir', path);
    if (!configuration.readSettings('inputDir')) {
        showError('Failed to set/update the input directory');
    } else {
        console.log('Input directory updated: ' + path);
    }
}

function setOutputDirectory(path) {
    configuration.saveSettings('outputDir', path);
    var value = configuration.readSettings('outputDir');
    if (value == undefined || value == null || value == "") {
        showError('Failed to set/update the output directory');
    } else {
        console.log('Output directory updated: ' + path);
    }
}

function setXsdFile(path) {
    configuration.saveSettings('xsdFile', path);
    var value = configuration.readSettings('xsdFile');
    if (value == undefined || value == null) {
        showError('Failed to set/update the XSD file');
    } else {
        console.log('XSD file selected: ' + path);
    }
}

function isXsdFileSelected() {
    var xsdFilePath = getUserSettingsValue('xsdFile');
    return xsdFilePath ? true : false;
}

function isValidCareGiverName() {
    var val = getUserSettingsValue('careGiverName');
    return val ? true : false;
}

function isValidCareGiverCode() {
    var val = getUserSettingsValue('careGiverCode');
    return val ? true : false;
}

function setExcludeAttributes(arg) {
    configuration.saveSettings('excludeAttributes', arg);
    if (!configuration.readSettings('excludeAttributes')) {
        showError('Failed to save settings for excluding attributes: startdatumZorgtraject, einddatumZorgtraject');
    } else {
        console.log('Exclude attributes: ' + arg);
        if ("yes" === arg) {
            sendLogMessage("Attributes will be excluded: startdatumZorgtraject, einddatumZorgtraject");
        } else {
            sendLogMessage("Attributes will be included: startdatumZorgtraject, einddatumZorgtraject");
        }
    }
}

function setInitialSubmission(arg) {
    configuration.saveSettings('initialSubmission', arg);
    if (!configuration.readSettings('initialSubmission')) {
        showError('Failed to save settings for initial submission');
    } else {
        console.log('Initial submission: ' + arg);
        if ("yes" === arg) {
            isInitialSubmission = true;
            sendLogMessage("Output file will be set up as an initial submission file");
        } else {
            isInitialSubmission = false;
            sendLogMessage("Output file will be set up as a regular submission file");
        }
    }
}

function setValidateXml(arg) {
    configuration.saveSettings('validateXml', arg);
    if (!configuration.readSettings('validateXml')) {
        showError('Failed to save settings for xml validation');
    } else {
        console.log('Validate XML after merge: ' + arg);
        if ("yes" === arg) {
            isValidateXml = true;
            sendLogMessage("Output file will be validated against the given XSD");
        } else {
            isValidateXml = false;
            sendLogMessage("Output file will not be validated against the given XSD");
        }
    }
}

function setMasterCareGiverName(arg) {
    configuration.saveSettings('careGiverName', arg);
    var val = !configuration.readSettings('careGiverName');
    if (isNull(val)) {
        showError('Failed to save Caregiver\'s name');
    } else {
        console.log('Caregiver name: ' + arg);
        sendLogMessage("Default name for the Caregiver: " + arg);
    }
}

function setMasterCareGiverCode(arg) {
    configuration.saveSettings('careGiverCode', arg);
    var val = !configuration.readSettings('careGiverCode');
    if (isNull(val)) {
        showError('Failed to save Caregiver\'s code');
    } else {
        console.log('Caregiver code: ' + arg);
        sendLogMessage("Default code for the Caregiver: " + arg);
    }
}

function resetUserSettings() {
    // at this moment, user settings consist of only input/output directories
    if (!__default_input_dir || !__default_output_dir) {
        console.log('Failed to reset settings. Default input/output path is undefined.');
        return;
    }

    setInputDirectory(__default_input_dir);
    setOutputDirectory(__default_output_dir);
    setExcludeAttributes("no");
    setValidateXml("no");
    setXsdFile("");
    setInitialSubmission("no");
    setMasterCareGiverName("");
    setMasterCareGiverCode("");

    notifyUpdateSettings();
}

function mergeFiles(filepaths) {
    if (isMerging) {
        sendLogMessage("Merging already in progress. Ignoring merge request.");
        return;
    }

    // No need to send the event: input elements should have already been disabled upon sending merge request.
    // broadcastEvent('notify-disable-input-elements', true, [mainWindow]);

    // validate input
    // need more than 1 file to be able to start the merge process
    if (!filepaths || filepaths.length <= 1) {
        showMessage("There must be at least 2 files selected for merging.");
        toggleMergeInProgress(false);
        return;
    }

    beginMergeProcess(filepaths);
}

function toggleMergeInProgress(bool) {
    isMerging = bool;
    broadcastEvent('notify-disable-input-elements', bool, [mainWindow]);
}

/**
 * 1. Read the first file and use it as the master document
 * 2. Using the master document, read the other files and:
 *   a. validate root node,
 *   b. for each patient record, process accordingly and update master document
 * 3. Write the updated master document as an XML file
 *
 * @param filepaths An array of filepaths of the to be merged XML files
 */
function beginMergeProcess(filepaths) {
    // start merge process
    sendLogMessage(
        "---------------- Begin merge process. Selected number of files = " + filepaths.length + " ----------------"
    );
    toggleMergeInProgress(true);

    console.log("---------------- Begin merge process ----------------");

    // 1. Create an empty master document and populate the data from the the first readable and valid file
    if (!createMasterDocument(filepaths)) {
        sendLogMessage("Failed to create a master document. Merge process aborted.");
        showError("Failed to create a master document. Merge process aborted.");
        toggleMergeInProgress(false);
        sendLogMessage("----------------  Merge process aborted ----------------");
        console.log("----------------  Merge process aborted ----------------");
        return;
    }

    var patientTotal = masterSbgObj.document.getElementsByTagName("Patient").length;
    var patientDuplicates = 0;
    var zorgtrajectTotal = masterSbgObj.document.getElementsByTagName("Zorgtraject").length;
    var zorgtrajectDuplicates = 0;

    // 2. Using the master document as a base, read the other files
    for (var i = 0; i < filepaths.length; i++) {
        var path = filepaths[i];
        var filename = path.split(getDirSeparator()).pop();
        if (!path || path.length < 1) {
            sendLogMessage("Invalid file path. Skipping: " + filename);
            continue;
        }

        //  2a. validate root node
        var doc = parseAndValidateXmlDocument(path);
        if (!doc) {
            sendLogMessage("Cannot create a valid document. Skipping: " + filename);
            continue;
        } // -- end of 2a. ----------
        sendLogMessage("File is a valid document. Processing: " + filename);

        // 2b. for each patient record, process accordingly,
        var patientElements = doc.documentElement.getElementsByTagName("Patient");
        if (!patientElements || patientElements.length < 1) {
            sendLogMessage("No patient node available. Skipping: " + filename);
            console.log("No patient node available. Skipping: " + filename);
            continue;
        }

        console.log("File: " + filename + ", Patient nodes=" + patientElements.length);
        patientTotal += patientElements.length;

        for (var j = 0; j < patientElements.length; j++) {
            var patientNode = patientElements[j];
            var patientId = patientNode.getAttribute("koppelnummer");

            var patientZorgtrajectElements = patientNode.getElementsByTagName("Zorgtraject");
            zorgtrajectTotal += patientZorgtrajectElements.length;

            // console.log("Processing patient id=" + patientElements.length);
            var masterZaNode = masterSbgObj.document.getElementsByTagName("Zorgaanbieder")[0];
            var isPatientAlreadyExist = false;
            var masterPatientElements = masterZaNode.getElementsByTagName("Patient");
            var masterPatientNode = null;
            for (var k = 0; k < masterPatientElements.length; k++) {
                masterPatientNode = masterPatientElements[k];
                var masterPatientId = masterPatientNode.getAttribute("koppelnummer");
                if (nullSafeEquals(masterPatientId, patientId)) {
                    isPatientAlreadyExist = true;
                    break;
                }
            }

            if (isPatientAlreadyExist) {
                patientDuplicates++;
                // if the patient is known, append all child nodes (zorgtrajects) to master's patient node
                sendLogMessage("Patient (id=" + patientId + ") already exists. Merging zorgtrajects."); // comment out this line if it's too spammy

                var patientZorgtrajectNode = null;
                for (var l = 0; l < patientZorgtrajectElements.length; l++) {
                    patientZorgtrajectNode = patientZorgtrajectElements[l];
                    var patientZorgtrajectId = patientZorgtrajectNode.getAttribute("zorgtrajectnummer");
                    var isZorgtrajectAlreadyExist = false;

                    // check for existing zorgtraject for this patient in the master document
                    var masterPatientZorgtrajectElements = masterPatientNode.getElementsByTagName("Zorgtraject");
                    var masterPatientZorgtrajectNode = null;
                    for (var m = 0; m < masterPatientZorgtrajectElements.length; m++) {
                        masterPatientZorgtrajectNode = masterPatientZorgtrajectElements[m];
                        var masterPatientZorgtrajectId = masterPatientZorgtrajectNode.getAttribute("zorgtrajectnummer");
                        if (nullSafeEquals(masterPatientZorgtrajectId, patientZorgtrajectId)) {
                            sendLogMessage(":. Zorgtraject (zt=" + patientZorgtrajectId + ") already exists for this patient. Merging DBCs.");
                            isZorgtrajectAlreadyExist = true;
                            zorgtrajectDuplicates++;

                            // insert all child nodes into the existing Zorgtraject node
                            // todo: remove duplicate diagnoses
                            // var patientZorgtrajectChildNodes = patientZorgtrajectNode.childNodes;
                            // for (var n = 0; n < patientZorgtrajectChildNodes.length; n++) {
                            //     if (patientZorgtrajectChildNodes[n].tagName) {
                            //         masterPatientZorgtrajectNode.appendChild(patientZorgtrajectChildNodes[n].cloneNode(true));
                            //     }
                            // }

                            // insert all DBCTrajects into the existing Zorgtraject node
                            // todo: is it really ok to leave out the diagnoses? (presuming that diagnoses may never change within a Zorgtraject)
                            var newDbcElements = patientZorgtrajectNode.getElementsByTagName("DBCTraject");
                            for (var o = 0; o < newDbcElements.length; o++) {
                                if (newDbcElements[o].tagName) {
                                    masterPatientZorgtrajectNode.appendChild(newDbcElements[o].cloneNode(true));
                                }
                            }

                            break;
                        }
                    }

                    // otherwise, append all child nodes of this patient
                    if (!isZorgtrajectAlreadyExist) {
                        var patientChildNodes = patientNode.childNodes;
                        for (var z = 0; z < patientChildNodes.length; z++) {
                            var nodeTagName = patientChildNodes[z].tagName;
                            if (nodeTagName) {
                                masterPatientNode.appendChild(patientChildNodes[z].cloneNode(true));
                                // console.log("Added child node: " + nodeTagName);
                            }
                        }
                    }
                }
            } else {
                // otherwise, append the patient node and all of its children
                masterZaNode.appendChild(patientNode.cloneNode(true));
                // sendLogMessage("Added Patient (id=" + patientId + ") to the master document");
                // console.log("Added Patient (id=" + patientId + ")");
            }
        } // -- end of 2b. ----------
    }

    console.log("Files merged.");
    console.log("Patients across all files: " + patientTotal + ". Duplicates: " + patientDuplicates + ". Total: " + (patientTotal - patientDuplicates));
    console.log("Zorgtrajects across all files: " + zorgtrajectTotal + ". Duplicates: " + zorgtrajectDuplicates + ". Total: " + (zorgtrajectTotal - zorgtrajectDuplicates));

    // 3. Write the updated master document as an XML file
    var fullOutputPath = getFullOutputFilePath();
    var xmlSer = new XMLSerializer();
    var dataStr = xmlSer.serializeToString(masterSbgObj.document);

    // strip attributes when requested
    var settings = configuration.readSettings('excludeAttributes');
    if (settings && ("yes" === settings)) {
        dataStr = stripAttributes(dataStr);
    }

    if (writeDataToFile(dataStr, fullOutputPath)) {
        masterSbgObj.fullpath = fullOutputPath;
        toggleMergeInProgress(false);
        sendLogMessage("----------------  Merge process finished successfully ----------------");
        console.log("----------------  Merge process finished successfully ----------------");

        // validateXmlAgainstXsd(dataStr);
    } else {
        toggleMergeInProgress(false);
        sendLogMessage("----------------  Merge process aborted ----------------");
        console.log("----------------  Merge process aborted ----------------");
    }
}

// TODO: REMOVED: due to compile issues
// function validateXmlAgainstXsd(data) {
//     if (!isValidateXml) {
//         return;
//     }
//
//     if (!isXsdFileSelected()) {
//         sendLogMessage("Failed to validate XML. This process is skipped. Reason: there is no XSD file selected.");
//         console.log("Failed to validate XML; no XSD file selected");
//         return;
//     }
//
//     // validate output xml file against xsd
//     var xsdFile = getUserSettingsValue('xsdFile');
//     var xsdFileContent = fs.readFileSync(xsdFile, FILE_ENCODING);
//     if (!xsdFileContent) {
//         sendLogMessage("Failed to validate XML. This process is skipped. Reason: cannot read XSD file");
//         console.log("Cannot read XSD file");
//         return;
//     }
//
//     var schema = xmlValidator.parse(xsdFileContent);
//     var validationErrors = schema.validate(data);
//     if (validationErrors) {
//         var errorLogName = "xml_validation_errors_" + moment().format('YYYY-MM-DD-HH-mm-ss') + ".txt";
//         var errorFullPath = getUserDefinedPathOrDesktop('outputDir') + getDirSeparator() + errorLogName;
//         sendLogMessage("XML Schema (XSD) validation has failed. See error logs: " + errorLogName);
//         console.log("XML Schema (XSD) validation has failed. Error logs: " + errorLogName);
//         // write error log
//         writeDataToFile(validationErrors, errorFullPath);
//     } else {
//         sendLogMessage("XML Schema (XSD) validation successful");
//         console.log("XML Schema (XSD) validation successful");
//     }
// }

function stripAttributes(data) {
    console.log("Stripping attributes");

    if (data === undefined || data === null) {
        sendLogMessage("Failed to strip attributes: source of data is undefined.");
        console.log("Failed to strip attributes. Data is undefined: " + data);
        return data;
    }

    var newData = data;
    newData = newData.replace(/(([ ]+)?)startdatumZorgtraject=["']([^'"]+)["']/g, "");
    newData = newData.replace(/(([ ]+)?)einddatumZorgtraject=["']([^'"]+)["']/g, "");

    return newData;
}

function getFullOutputFilePath() {
    var outputDir = getUserDefinedPathOrDesktop('outputDir');
    var sbgXmlFileName = getSbgFileName();
    return outputDir + getDirSeparator() + sbgXmlFileName + ".xml";
}

function getSbgFileName() {
    var dateArr = masterSbgObj.endDate.split('-');
    var year = dateArr[0];
    var month = dateArr[1];
    var zaCode = masterSbgObj.getZaCode();
    var zaName = masterSbgObj.getZaName();

    return zaCode + "_" + zaName + "_SBG_" + month + "_" + year + "_001";
}

function writeDataToFile(data, fullpath) {
    sendLogMessage("Writing a merged XML into a file. Full path: " + fullpath);

    var success = true;
    fs.writeFileSync(fullpath, data, FILE_ENCODING, function (err) {
        sendLogMessage("Failed writing a file. " + err);
        showError("Failed to create a master document. Merge process aborted.");
        success = false;
    });

    return success;
}

function createMasterDocument(filepaths) {
    // loop through files and create a master document based on the first viable option
    for (var i = 0; i < filepaths.length; i++) {
        var path = filepaths[i];
        if (path && path.length > 0) {
            if (createMasterSbgObject(path)) {
                // master document is created!
                return true;
            }
        }
    }

    return false;
}

function createMasterSbgObject(filepath) {
    // reset
    masterSbgObj.resetProperties();

    var filename = filepath.split(getDirSeparator()).pop();
    sendLogMessage("Creating a master document from file: " + filename);

    // read and parse xml file
    var fileContent = fs.readFileSync(filepath, FILE_ENCODING);
    if (!fileContent) {
        sendLogMessage("Cannot create a master document using file: " + filename);
        return false;
    }
    var parser = new DOMParser();
    var doc = parser.parseFromString(fileContent, FILE_TYPE_XML);

    // validate root node
    if (doc.documentElement.nodeName != "BenchmarkImport") {
        sendLogMessage("Invalid root node. Node 'BenchmarkImport' is not found.");
        return false;
    }

    // validate root attributes
    // var attrsNodeMap = doc.documentElement.attributes; // returns a https://developer.mozilla.org/en-US/docs/Web/API/NamedNodeMap
    // var version = attrsNodeMap.getNamedItem("versie"); // returns a https://developer.mozilla.org/en-US/docs/Web/API/Attr
    var version = doc.documentElement.getAttribute("versie");
    var startDate = doc.documentElement.getAttribute("startdatumAangeleverdePeriode");
    var endDate = doc.documentElement.getAttribute("einddatumAangeleverdePeriode");
    var creationDate = doc.documentElement.getAttribute("datumCreatie");

    if (!version || !startDate || !endDate || !creationDate) {
        sendLogMessage("Invalid root attributes: version=" + version + ", period=" + startDate + "-" + endDate + ", created=" + creationDate);
        return false;
    }

    // validate SBG XML document structure
    var zorgaanbieders = doc.documentElement.getElementsByTagName("Zorgaanbieder");
    if (zorgaanbieders && zorgaanbieders.length != 1) {
        sendLogMessage("Invalid SBG XML document: found more than one 'Zorgaanbieder' node.");
        return false;
    }

    // Note: Element.getElementsByTagName() returns a live and dynamic NodeList.
    var zorgaanbiederEl = zorgaanbieders[0];
    // Important note:
    // - Element.querySelectorAll() returns a static NodeList.
    // - Element.getElementsByTagName() returns a live and dynamic NodeList.
    if (!zorgaanbiederEl) {
        sendLogMessage("Invalid SBG XML document: 'Zorgaanbieder' node is not found.");
        return false;
    }

    var zaName = zorgaanbiederEl.getAttribute("zorgaanbiedernaam");
    var zaCode = zorgaanbiederEl.getAttribute("zorgaanbiedercode");
    if (!zaName || !zaCode) {
        sendLogMessage("Invalid attributes for 'Zorgaanbieder' node: zorgaanbiedernaam=" + zaName + ", zorgaanbiedercode=" + zaCode);
        return false;
    }

    // masterSbgObj.rawContent = fileContent;
    masterSbgObj.version = version;
    masterSbgObj.startDate = startDate;
    masterSbgObj.endDate = endDate;
    masterSbgObj.creationDate = creationDate;

    if (isInitialSubmission && isValidCareGiverName() && isValidCareGiverCode()) {
        // set the user defined name and code of the Caregiver in the master document
        zaName = getUserSettingsValue('careGiverName');
        zaCode = getUserSettingsValue('careGiverCode');
        zorgaanbiederEl.setAttribute("zorgaanbiedernaam", zaName);
        zorgaanbiederEl.setAttribute("zorgaanbiedercode", zaCode);
    }

    masterSbgObj.setZaName(zaName);
    masterSbgObj.setZaCode(zaCode);

    // A master document consists of:
    //  - A root element (BenchmarkImport),
    //  - a Care provider element (Zorgaanbieder) with their attributes.
    // The Care provider element should have no child nodes

    // create an empty master document
    var masterDoc = parser.parseFromString(
        XML_DECLARATION + '<BenchmarkImport>\r\n<Zorgaanbieder></Zorgaanbieder>\r\n</BenchmarkImport>',
        FILE_TYPE_XML
    );
    // populate root with attributes from the first XML file
    var attributes = doc.documentElement.attributes;
    for (var i = 0; i < attributes.length; i++) {
        console.log("attr name: "+ attributes[i].name + ", value: " + attributes[i].value);
        masterDoc.documentElement.setAttribute(attributes[i].name, attributes[i].value);
    }

    // add an empty Care provider node to master document
    var newZaEl = masterDoc.documentElement.getElementsByTagName("Zorgaanbieder");
    newZaEl[0].setAttribute("zorgaanbiedernaam", zaName);
    newZaEl[0].setAttribute("zorgaanbiedercode", zaCode);

    sendLogMessage(
        "Master document created. " +
        "SBG(version=" + masterSbgObj.version + ", period=" + masterSbgObj.startDate + "-" + masterSbgObj.endDate + ") " +
        "Zorgaanbieder(name=" + masterSbgObj.getZaName() + ", code=" + masterSbgObj.getZaCode() + ")"
    );

    // lastly, save the XML object into masterObj
    masterSbgObj.document = masterDoc;
    console.log("Master document created successfully!");

    return true;
}

function parseAndValidateXmlDocument(filepath) {
    if (!masterSbgObj) {
        sendLogMessage("Missing master document. Aborting.");
        return null;
    }

    var filename = filepath.split(getDirSeparator()).pop();
    sendLogMessage("Reading file: " + filename);

    // read and parse xml file
    var fileContent = fs.readFileSync(filepath, FILE_ENCODING);
    if (!fileContent) {
        sendLogMessage("Cannot read the file: " + filename);
        return null;
    }
    // Parse XML from content
    var parser = new DOMParser();
    var doc = parser.parseFromString(fileContent, FILE_TYPE_XML);

    // validate root node
    if (doc.documentElement.nodeName != "BenchmarkImport") {
        sendLogMessage("Invalid root node. Node 'BenchmarkImport' is not found.");
        return null;
    }

    // validate root attributes
    // version
    var version = doc.documentElement.getAttribute("versie");
    if (!version) {
        sendLogMessage("Invalid root attributes: version=" + version);
        return null;
    }
    if (version != masterSbgObj.version) {
        sendLogMessage(
            "Mismatched 'BenchmarkImport' attributes. " +
            "Expected: version=" + masterSbgObj.version +
            "Actual: version=" + version
        );
        return null;
    }
    // period
    var startDate = doc.documentElement.getAttribute("startdatumAangeleverdePeriode");
    var endDate = doc.documentElement.getAttribute("einddatumAangeleverdePeriode");
    if (!startDate || !endDate) {
        sendLogMessage("Invalid root attributes: period=" + startDate + "-" + endDate);
        return null;
    }

    if (isInitialSubmission) {
        // For an initial distribution: expand the submission's period of the master doc to include all child docs
        if (moment(masterSbgObj.startDate).isAfter(startDate)) {
            sendLogMessage("Submission's start date is updated. Actual:" + startDate + " Was: " + masterSbgObj.startDate);
            console.log("Master start date updated to: " + startDate + " (was: " + masterSbgObj.startDate + ")");

            masterSbgObj.startDate = startDate;
            masterSbgObj.document.documentElement.setAttribute("startdatumAangeleverdePeriode", startDate);
        }
        if (moment(masterSbgObj.endDate).isBefore(endDate)) {
            sendLogMessage("Submission's end date is updated. Actual:" + endDate + " Was: " + masterSbgObj.endDate);
            console.log("Master end date updated to: " + endDate + " (was: " + masterSbgObj.endDate + ")");

            masterSbgObj.endDate = endDate;
            masterSbgObj.document.documentElement.setAttribute("einddatumAangeleverdePeriode", endDate);
        }
        // and skip validation process for the Zorgaanbieder
        return doc;
    }

    // else, continue with the validation process for regular submission
    // validate the period against master doc's period
    if (startDate != masterSbgObj.startDate || endDate != masterSbgObj.endDate) {
        sendLogMessage(
            "Mismatched 'BenchmarkImport' attributes. " +
            "Expected: period=" + masterSbgObj.startDate + "-" + masterSbgObj.endDate + ". " +
            "Actual: period=" + startDate + "-" + endDate
        );
        return null;
    }

    // validate Zorgaanbieder
    // Important note:
    // - Element.querySelectorAll() returns a static NodeList.
    // - Element.getElementsByTagName() returns a live and dynamic NodeList.
    var zorgaanbiederEl = doc.documentElement.getElementsByTagName("Zorgaanbieder")[0];
    if (!zorgaanbiederEl) {
        sendLogMessage("Invalid SBG XML document structure. Node 'Zorgaanbieder' is not found.");
        return null;
    }

    var zaName = zorgaanbiederEl.getAttribute("zorgaanbiedernaam");
    var zaCode = zorgaanbiederEl.getAttribute("zorgaanbiedercode");
    if (!zaName || !zaCode) {
        sendLogMessage("Invalid attributes for 'Zorgaanbieder' node: zorgaanbiedernaam=" + zaName + ", zorgaanbiedercode=" + zaCode);
        return null;
    }

    if (zaName != masterSbgObj.getZaName() || zaCode != masterSbgObj.getZaCode()) {
        sendLogMessage(
            "Mismatched 'Zorgaanbieder' attributes. " +
            "Expected: zorgaanbiedernaam=" + masterSbgObj.getZaName() + ", zorgaanbiedercode=" + masterSbgObj.getZaCode() + ". " +
            "Actual: zorgaanbiedernaam=" + zaName + ", zorgaanbiedercode=" + zaCode
        );
        return null;
    }

    return doc;
}

// ----------------------------- Utils ----------------------------- //
function isNull(val) {
    return val === undefined || val === null;
}

function isEmptyString(val) {
    return val.trim() === "";
}

function isNullOrEmpty(val) {
    return isNull(val) || isEmptyString(val);
}

function nullSafeEquals(val1, val2) {
    val1 = isNullOrEmpty(val1) ? null : val1.trim().toLowerCase();
    val2 = isNullOrEmpty(val2) ? null : val2.trim().toLowerCase();
    return val1 === val2;
}

function resizeBrowserWindow(win, width, height) {
    win.setSize(width, height, true);
}

function showDirectory(fullPath) {
    shell.showItemInFolder(fullPath);
}

function makeDirectory(dirPath) {
    fs.mkdirSync(dirPath, function (error) {
        console.log(error);
        showError('Failed to create directory: ' + dirPath);
    });
}

function getDirSeparator() {
    return (process.platform == 'win32') ? "\\" : "/";
}

function showError(msg) {
    dialog.showErrorBox('Error', msg);
    console.log(msg);
}

function showMessage(msg) {
    dialog.showMessageBox({message: msg, buttons: ["Ok"]});
    console.log(msg);
}

function showWarning(msg, detail) {
    dialog.showMessageBox({
        type: "warning",
        buttons: [],
        title: "Warning",
        message: msg,
        detail: detail
    });
    console.log(msg);
}

function getUserDefinedPathOrDesktop(settingsKey) {
    var path = getUserSettingsValue(settingsKey);
    if (!path) {
        path = getUserDesktopPath();
        console.log("Cannot find user-configured directory (key='" + settingsKey + "'). Using default path: " + path);
    }

    return path;
}

function getUserSettingsValue(key) {
    var val = configuration.readSettings(key);
    if (isNullOrEmpty(val)) {
        return null;
    }
    return val.trim();
}

function getUserDesktopPath() {
    return app.getPath('userDesktop');
}

function notifyUpdateSettings() {
    broadcastEvent('notify-update-settings', null, [mainWindow, settingsWebContent]);
}

function sendLogMessage(msg) {
    broadcastEvent('append-log-message', msg, [mainWindow]);
}

function broadcastEvent(key, data, windows) {
    // optional parameters
    if (!key) {
        console.log("Broadcast failed: undefined key");
        return;
    }

    if (!windows || windows.length < 1) {
        windows = mainWindow; // default window is mainWindow
    }

    for (var i = 0; i < windows.length; i++) {
        var windowObj = windows[i];
        if (windowObj) {
            if (!data || data.length < 1) {
                windowObj.send(key);
            } else {
                windowObj.send(key, data);
            }
        }
    }
}

// ----------------------------- Objects ----------------------------- //

// singleton
var masterSbgObj = {
    name: null,
    fullpath: null,
    document: null,
    version: null,
    startDate: null,
    endDate: null,
    creationDate: null,
    zorgaanbieder: {
        name: null,
        code: null
    },

    // setters
    setZaName: function (name) {
        this.zorgaanbieder.name = name;
    },
    setZaCode: function (code) {
        this.zorgaanbieder.code = code;
    },

    // getters
    getZaName: function () {
        return this.zorgaanbieder['name'];
    },
    getZaCode: function () {
        return this.zorgaanbieder['code'];
    },

    // reset
    resetProperties: function () {
        this.name = null;
        this.fullpath = null;
        this.document = null;
        this.version = null;
        this.startDate = null;
        this.endDate = null;
        this.creationDate = null;
        this.setZaName(null);
        this.setZaCode(null);
    }
};

