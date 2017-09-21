'use strict';

const ipcRenderer = require('electron').ipcRenderer;
const configuration = require('./configuration');
const fs = require('file-system');

var checkboxes = [];
var filesListEl = document.querySelector('#files-list');
var loggingWindowEl = document.querySelector('#logging-window');

// ----------------------------- Event listeners ----------------------------- //
var mergeBadgeEl = document.querySelector("#merge-btn span.badge");
filesListEl.addEventListener('change', function () {
    updateBadge();
});

var settingsButtonEl = document.querySelector('#settings-btn');
settingsButtonEl.addEventListener('click', function () {
    ipcRenderer.send('open-settings-window');
});

var selectAllEl = document.querySelector('#select-all-btn');
selectAllEl.addEventListener('click', function () {
    selectAllFiles(true);
    updateBadge();
});

var selectNoneEl = document.querySelector('#select-none-btn');
selectNoneEl.addEventListener('click', function () {
    selectAllFiles(false);
    updateBadge();
});

var showInDirButtonEl = document.querySelector('#show-input-dir-btn');
showInDirButtonEl.addEventListener('click', function (event, arg) {
    ipcRenderer.send('show-input-dir');
});

var showOutDirButtonEl = document.querySelector('#show-output-dir-btn');
showOutDirButtonEl.addEventListener('click', function (event, arg) {
    ipcRenderer.send('show-output-dir');
});

var cleanLogButtonEl = document.querySelector('#clean-log-window-btn');
cleanLogButtonEl.addEventListener('click', function (event, arg) {
    // ipcRenderer.send('clean-log-window-btn');
    cleanLogMessages();
});

var mergeButtonEl = document.querySelector('#merge-btn');
mergeButtonEl.addEventListener('click', function (event, arg) {
    ipcRenderer.send('do-merge-files', getSelectedFiles());

    disableInputElements(true);
});

ipcRenderer.on('notify-update-settings', function (event, arg) {
    updateFileList();
    updateBadge();
});

ipcRenderer.on('notify-disable-input-elements', function (event, arg) {
    disableInputElements(arg);
});

ipcRenderer.on('append-log-message', function (event, arg) {
    appendLogMessage(arg);
});
// -------------------------------------------------------------------------- //

// init
update();

var specsTextEl = document.querySelector('#specs-text');
var specsText = ""
    // + process.env.npm_package_name + " " + process.env.npm_package_version + ", "
    + "Node " + process.versions.node + ", "
    + "Chromium " + process.versions.chrome + ", "
    + "Electron " + process.versions.electron + ".";
var textEl = document.createTextNode(specsText);
specsTextEl.appendChild(textEl);

// -------------------------------- functions ------------------------------- //
function update() {
    updateFileList();
    updateBadge();
}

// Traverse through files inside the given Input folder
function updateFileList() {
    var inputDir = configuration.readSettings('inputDir');
    if (!inputDir) {
        checkboxes = [];
        filesListEl.innerHTML = "";
        return;
    }

    checkboxes = [];
    var i = 0;
    var newListEl = document.createElement("DIV");
    // for each XML file found, add it to the list
    // synchronous call
    fs.recurseSync(inputDir, ['*.xml'], function (filepath, relative, filename) {
        if (filename) {
            i++; // counter
            var id = "file-item-" + i;

            var inputGroupEl = document.createElement("DIV");
            inputGroupEl.setAttribute("class", "input-group-container");

            var checkbox = document.createElement("INPUT");
            checkbox.type = "checkbox";
            checkbox.checked = false;
            checkbox.className = "file-item";
            checkbox.setAttribute("id", id);
            checkbox.setAttribute("filepath", filepath);
            checkboxes.push(checkbox);

            var labelEl = document.createElement("LABEL");
            labelEl.htmlFor = id;
            var labelText = document.createTextNode(filename);
            labelEl.appendChild(labelText);

            inputGroupEl.appendChild(checkbox);
            inputGroupEl.appendChild(labelEl);
            newListEl.appendChild(inputGroupEl);
        }
    });

    if (i == 0) {
        filesListEl.innerHTML = 'The input folder is empty or has no XML files. <br/>Put the XML files inside this folder or choose another folder via <i>Settings</i>. Click on the cogwheel icon <span class="glyphicon glyphicon-cog" aria-hidden="true"></span> on the top-right corner to open the <i>Settings</i> window.';
    } else {
        filesListEl.innerHTML = "";
        filesListEl.appendChild(newListEl);
    }

    appendLogMessage("Input folder updated. Files found: " + i);
}

function selectAllFiles(toggle) {
    for (var i = 0; i < checkboxes.length; i++) {
        var checkbox = checkboxes[i];
        if (checkbox.getAttribute("type") === "checkbox") {
            checkbox.checked = toggle;
        }
    }
}

function getSelectedFiles() {
    var filepaths = [];
    for (var i = 0; i < checkboxes.length; i++) {
        var checkbox = checkboxes[i];
        if (checkbox.getAttribute("type") === "checkbox" && checkbox.getAttribute("filepath").length > 0) {
            if (checkbox.checked) {
                filepaths.push(checkbox.getAttribute("filepath"));
            }
        }
    }

    return filepaths;
}

function updateBadge() {
    var checked = countSelectedFiles();
    if (checked != null) {
        mergeBadgeEl.innerHTML = checked;
    }
}

function countSelectedFiles() {
    return filesListEl.querySelectorAll("input:checked").length;
}

function disableInputElements(toggle) {
    var elements = document.querySelectorAll(
        ".file-selector-container [type='button'], .file-selector-container [type='checkbox']"
    );

    for (var i = 0; i < elements.length; i++) {
        var obj = elements[i];
        if (obj.getAttribute("type") === "button" || obj.getAttribute("type") === "checkbox") {
            obj.disabled = toggle;
        }
    }
}

function getLogPrefix() {
    var now = new Date();
    var locale = 'nl-NL';
    return "[" + now.toLocaleDateString(locale) + " " + now.toLocaleTimeString(locale) + "] ";
}

function appendLogMessage(msg) {
    msg = getLogPrefix() + msg;

    var textEl = document.createTextNode(msg);
    loggingWindowEl.appendChild(textEl);

    var brEl = document.createElement("BR");
    loggingWindowEl.appendChild(brEl);

    loggingWindowEl.scrollTop = loggingWindowEl.scrollHeight;
}

function cleanLogMessages() {
    loggingWindowEl.innerHTML = "";
    appendLogMessage("Log window is cleared");
}


