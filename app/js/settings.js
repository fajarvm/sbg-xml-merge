'use strict';

const ipcRenderer = require('electron').ipcRenderer;
const configuration = require('./configuration');
const jQuery = require('./js/jquery-1.12.3.min.js');

const XSD_SELECT_CONTAINER_ID = "#xsd_file_selector_row";
const CAREGIVER_INFO_CONTAINER_ID = "#caregiver_info_row";

// ----------------------------- Event listeners ----------------------------- //
var closeIconEl = document.querySelector('.close');
closeIconEl.addEventListener('click', broadcastCloseWindow);
var closeBtnEl = document.querySelector('#close-window-btn');
closeBtnEl.addEventListener('click', broadcastCloseWindow);

var inputEl = document.querySelector('#input_column');
inputEl.addEventListener('click', function (event, arg) {
    ipcRenderer.send('open-dialog-input-dir');
});

var outputEl = document.querySelector('#output_column');
outputEl.addEventListener('click', function (event, arg) {
    ipcRenderer.send('open-dialog-output-dir');
});

// TODO: REMOVED due compile issues
/*
 var xsdEl = document.querySelector('#xsd_input');
 xsdEl.addEventListener('click', function (event, arg) {
 ipcRenderer.send('open-dialog-xsd-file');
 });

 var validateXmlEl = document.querySelector('#validate_xml_chk');
 validateXmlEl.addEventListener('click', function (event, arg) {
 var val = this.checked ? "yes" : "no";
 ipcRenderer.send('toggle-validate-xml', val);
 toggleShowHide(XSD_SELECT_CONTAINER_ID, this.checked);
 });
 */

var resetBtnEl = document.querySelector('#reset-settings-btn');
resetBtnEl.addEventListener('click', function (event, arg) {
    ipcRenderer.send('do-reset-settings');
});

var initSubmissionEl = document.querySelector('#initial_submission_chk');
initSubmissionEl.addEventListener('click', function (event, arg) {
    var val = this.checked ? "yes" : "no";
    ipcRenderer.send('toggle-initial-submission', val);
    toggleShowHide(CAREGIVER_INFO_CONTAINER_ID, this.checked);
});

var excludeChkBoxEl = document.querySelector('#remove_attributes_chk');
excludeChkBoxEl.addEventListener('click', function (event, arg) {
    var val = this.checked ? "yes" : "no";
    ipcRenderer.send('toggle-exclude-attributes', val);
});

var careGiverNameEl = document.querySelector('#cg_name');
careGiverNameEl.addEventListener('change', function (event, arg) {
    var val = this.value ? this.value.trim() : "";
    ipcRenderer.send('update-care-giver-name', val);
});

var careGiverCodeEl = document.querySelector('#cg_code');
careGiverCodeEl.addEventListener('change', function (event, arg) {
    var val = this.value ? this.value.trim() : "";
    ipcRenderer.send('update-care-giver-code', val);
});

ipcRenderer.on('notify-update-settings', function () {
    updateView();
});
// -------------------------------------------------------------------------- //

// init
updateView();


// -------------------------------- functions ------------------------------- //

function updateView() {
    var inputLabelEl = document.querySelector('#input_label');
    inputLabelEl.innerHTML = configuration.readSettings('inputDir');

    var outputLabelEl = document.querySelector('#output_label');
    outputLabelEl.innerHTML = configuration.readSettings('outputDir');

    var exclAttrs = configuration.readSettings('excludeAttributes');
    excludeChkBoxEl.checked = ("yes" === exclAttrs);

    // TODO: REMOVED due compile issues
    // var validateXml = configuration.readSettings('validateXml');
    // validateXmlEl.checked = ("yes" === validateXml);
    // toggleShowHide(XSD_SELECT_CONTAINER_ID, validateXmlEl.checked);
    //
    // var xsdLabelEl = document.querySelector('#xsd_label');
    // var xsdPath = configuration.readSettings('xsdFile');
    // xsdLabelEl.innerHTML = xsdPath === "" ? "Click to select a file" : xsdPath;

    var initSub = configuration.readSettings('initialSubmission');
    initSubmissionEl.checked = ("yes" === initSub);
    toggleShowHide(CAREGIVER_INFO_CONTAINER_ID, initSubmissionEl.checked);

    var careGiverName = configuration.readSettings('careGiverName');
    careGiverName = careGiverName.trim();
    careGiverNameEl.value = careGiverName;

    var careGiverCode = configuration.readSettings('careGiverCode');
    careGiverCode = careGiverCode.trim();
    careGiverCodeEl.value = careGiverCode;
}

function toggleShowHide(elementId, bool) {
    var element = jQuery(elementId);
    if (bool) {
        jQuery(elementId).slideDown(300);
    } else {
        jQuery(elementId).slideUp(300);
    }
}

function broadcastCloseWindow(event, args) {
    ipcRenderer.send('close-settings-window');
}
