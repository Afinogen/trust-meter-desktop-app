// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process because
// `nodeIntegration` is turned off. Use `preload.js` to
// selectively enable features needed in the rendering
// process.
const serialport = require('serialport');
const Readline = require('@serialport/parser-readline');
// const Delimiter = require('@serialport/parser-delimiter');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const net = require('net');
const isIp = require('is-ip');
const Store = require('electron-store');

let csvWriter;
let $ = require('jquery');
let port = null;
let measure = {
    'count': 0,
    'sum': 0,
    'max': 0,
};
let pingMkTimer;
let lastResponseMKTime = 0;
const store = new Store();

$(document).ready(function () {
    if (typeof store.get('countChartPoints') === 'undefined') {
        store.set('countChartPoints', 20);
        store.set('isEnableRpm', 0);
    }
    $('#countChartPoints').val(store.get('countChartPoints'));
    $('#enableRpm').prop('checked', store.get('isEnableRpm'));
    $('#connectIp').val(store.get('lastIp')).trigger('input');
    if (store.get('isEnableRpm') == 0) {
        $('.js-show-rpm').hide();
    }
});

async function listSerialPorts() {
    await serialport.list().then((ports, err) => {
        if (err) {
            document.getElementById('error').textContent = err.message
            return
        } else {
            document.getElementById('error').textContent = ''
        }

        $('#ports').empty();
        $('.js-usb-plug').removeClass('text-success');
        if (ports.length === 0) {
            document.getElementById('error').textContent = 'No ports discovered'
            $('#connectPort').addClass('disabled')
        } else {
            ports.forEach(function (port, index, object) {
                if (typeof (port.pnpId) == 'undefined') {
                    object.splice(index, 1);
                    return;
                }
                // console.log(port)
                $('#ports').append(`<option value="${port.path}">
                                       ${port.path}
                                  </option>`);
                $('#connectPort').removeClass('disabled')
                $('.js-usb-plug').addClass('text-success');
            });
        }
    })
}

// Set a timeout that will check for new serialPorts every 2 seconds.
// This timeout reschedules itself.
function listPorts() {
    listSerialPorts();
    setTimeout(listPorts, 2000);
}

let searchPorts = setTimeout(listPorts, 2000);

async function readFromPort(data) {
    // buffer = Buffer.from(data, 'utf8');
    // console.log(data.toString('utf8'));
    lastResponseMKTime = Date.now();

    data = data.toString('utf8').trim();
    data.split('\n').forEach(function (response) {
        response = response.split(';');
        if (response[0] == '$1') {
            setFirmwareVersion(response[1])
        } else if (response[0] == '$2') {
            loadSettings(response);
        } else if (response[0] == '$3') {
            // console.log(response);
            addMeasure(response);
        } else if (response[0] == '$4') {
            mkConfirmStopMeasure(response);
        } else if (response[0] == '$5') {
            console.log('Data: ', response);
        } else if (response[0] == '$6') {
            console.log('Data: ', response);
        } else if (response[0] == '$7') {
            console.log('Data: ', response);
        } else if (response[0] == '$8') {
            setIp(response[1]);
        } else if (response[0] == '$9') {
            updateThrottle(response[1]);
        } else if (response[0] == '$13') {

        } else if (response[0] == '$16') {
            getCalibrateFactor(response[1]);
        } else if (response[0] == '$17') {
            getGramms(response[1]);
        } else if (response[0] !== '') {
            console.log('Data: ', response);
        }
    });
    // console.log(buffer.readUint8(0), buffer.readUint8(1))
    // if (buffer.readUint8(0) == '$' && buffer.readUint8(1) == '2') {
    //     console.log('settings ok');
    // }
}

function setIp(data) {
    $('#deviceIp').text(data);
    if (data.length > 0) {
        store.set('lastIp', data);
        $('.js-device-wifi').addClass('text-success');
    } else {
        $('.js-device-wifi').removeClass('text-success');
    }
}

function setFirmwareVersion(data) {
    loadWindowHide();
    $('#firmwareVersion').text(data);
}

function loadSettings(data) {
    $('#settingsLoader').hide();
    $('#settingsPanel').fadeIn(300);
    $('#measureCorrection').val(data[1]);
    $('#wifiName').val(data[2]);
    $('#wifiPassword').val(data[3]);
    $('#minThrottle').val(data[4]);
    $('#maxThrottle').val(data[5]);
}

function updateThrottle(data) {
    if (data == '') {
        data = 0;
    }
    data = parseInt(data);
    $('#motorControl').val(data);
    $('#throttlePercent').text(data);
}

function addMeasure(data) {
    $('#startMeasure').text('Стоп');
    $('#startMeasure').val(1);
    let value = parseFloat(data[1]);
    measure.count++;
    measure.sum += value;
    if (measure.max < value) {
        measure.max = value;
    }
    updateTimeLineChart(value, parseInt(data[2]), parseInt(data[3]));
    updateMeasureTable();
}

function mkConfirmStopMeasure(data) {
    $('#startMeasure').text('Старт');
    $('#startMeasure').val(0);
}

function updateMeasureTable() {
    $('#measureAvg').text(Number(measure.sum / measure.count).toFixed(3));
    $('#measureMax').text(Number(measure.max).toFixed(3))
}

function connectWindowHide() {
    $('.js-window').hide();
    $('#loadWindow').fadeIn(300);
    clearTimeout(searchPorts);
}

function loadWindowHide() {
    if ($('#loadWindow').is(':visible')) {
        $('.js-window').hide();
        $('#controlWindow').fadeIn(300);
    }
}

function pingMK() {
    if (Date.now() - lastResponseMKTime >= 2000) {
        window.location.reload();
    }
    port.write('$1\n');
}

function connectSerial() {
    connectWindowHide();
    port = new serialport($('#ports').val(), {
        baudRate: 115200,
        autoOpen: false,
    })

    port.open(function (err) {
        if (err) {
            portClose();
            return console.log('Error opening port: ', err.message);
        }
        pingMkTimer = setInterval(() => port.write('$1\n'), 1000);

        // Because there's no callback to write, write errors will be emitted on the port:
        console.log('Connected Serial');
        port.write('$1\n');
        port.write('$8\n');
        port.write('$9\n');
    })
    // port.on('data', readFromPort)
    port.on('error', showError);
    port.on('close', portClose);

// Switches the port into "flowing mode"
//     port.on('readable', readFromPort)

// Pipe the data into another stream (like a parser or standard out)
    const lineStream = port.pipe(new Readline({delimiter: '\r\n'}));
    lineStream.on('data', readFromPort);
}

$('#connectPort').on('click', function () {
    if ($('#connectIp').val() != "") {
        connectSocket($('#connectIp').val());
    } else if ($('#ports').val() != null) {
        connectSerial();
    }
});
$('#connectIp').on('input', function () {
    if (isIp($(this).val())) {
        $('.js-ip-correct').addClass('text-success');
    } else {
        $('.js-ip-correct').removeClass('text-success');
    }
});
$('.js-close-port').on('click', function () {
    if (typeof port.close !== "undefined") {
        port.close();
    } else {
        port.destroy();
    }
});

$('#startMeasure').on('click', function () {
    if ($(this).val() == 0) {
        measure = {
            'count': 0,
            'sum': 0,
            'max': 0,
        };
        csvWriter = createCsvWriter({
            path: 'logs/' + (new Date()).toLocaleString() + '.csv',
            fieldDelimiter: ';',
            header: [
                {id: 'time', title: 'TIME'},
                {id: 'measure', title: 'MEASURE'},
                {id: 'throttle', title: 'THROTTLE'},
                {id: 'rpm', title: 'RPM'}
            ]
        });
        port.write('$3\n');
    } else {
        port.write('$4\n');
    }
});
$('#saveSettings').on('click', function () {
    store.set('countChartPoints', $('#countChartPoints').val());
    store.set('isEnableRpm', $('#enableRpm').is(':checked'));
    if (store.get('isEnableRpm') == 0) {
        $('.js-show-rpm').hide();
    } else {
        $('.js-show-rpm').show();
    }
    port.write('$5;' + $('#wifiName').val().trim() + '\n');
    port.write('$6;' + $('#wifiPassword').val().trim() + '\n');
    port.write('$11;' + $('#minThrottle').val().trim() + '\n');
    port.write('$12;' + $('#maxThrottle').val().trim() + '\n');
    port.write('$13;' + $('#measureCorrection').val().trim() + '\n');
    port.write('$10\n');
    port.write('$2\n');
    port.write('$7\n');
});
$('#motorControl').on('input', function () {
    port.write('$9;' + parseInt($(this).val()) + '\n');
});


function showError(error) {
    console.log('Serial port error: ' + error);
}

function portClose() {
    // $('.js-window').hide();
    // $('#connectWindow').fadeIn(300);
    // searchPorts = setTimeout(listPorts, 2000);
    window.location.reload();
}

$('#list-settings-list').on('shown.bs.tab', function (e) {
    port.write('$2\n');
})

///
var Chart = require('chart.js');
var ctx = document.getElementById('chartPropThrust');
var chartPropThrust = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Тяга, г',
                data: [],
                backgroundColor: [
                    'rgb(104,255,99)',
                ],
                borderColor: [
                    'rgb(104,255,99)',
                ],
                borderWidth: 1
            },
            {
                label: 'Газ, %',
                data: [],
                backgroundColor: [
                    'rgb(57,14,210)',
                ],
                borderColor: [
                    'rgb(57,14,210)',
                ],
                borderWidth: 1
            }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: "Тяга"
                }
            },
            x: {
                // beginAtZero: true,
                title: {
                    display: true,
                    text: "Время"
                }
            }
        }
    }
});
var chartMotorRpm = new Chart($('#chartMotorRpm'), {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Оброты, мин',
                data: [],
                backgroundColor: [
                    'rgb(104,255,99)',
                ],
                borderColor: [
                    'rgb(104,255,99)',
                ],
                borderWidth: 1
            }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: "Обороты"
                }
            },
            x: {
                // beginAtZero: true,
                title: {
                    display: true,
                    text: "Время"
                }
            }
        }
    }
});
//Download Chart Image
document.getElementById("download").addEventListener('click', function () {
    /*Get image of canvas element*/
    var url_base64jp = document.getElementById("chartPropThrust").toDataURL('image/jpeg', 1.0);
    /*get download button (tag: <a></a>) */
    var a = document.getElementById("download");
    /*insert chart image url to download button (tag: <a></a>) */
    a.href = url_base64jp;
});

async function updateTimeLineChart(value, throttle, rpm) {
    let date = new Date();
    let time = date.toLocaleTimeString();
    addData(chartPropThrust, time, value, throttle);
    addDataRpm(chartMotorRpm, time, rpm);
    removeData(chartPropThrust);
    removeDataRpm(chartMotorRpm);
    if (csvWriter) {
        await csvWriter.writeRecords([{
            'time': time,
            'measure': value,
            'throttle': throttle,
            'rpm': rpm
        }])
    }
}

function addData(chart, label, data, throttle) {
    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(data);
    chart.data.datasets[1].data.push(throttle);
    chart.update();
}

function addDataRpm(chart, label, data) {
    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(data);
    chart.update();
}

function removeData(chart) {
    if (chart.data.datasets[0].data.length > store.get('countChartPoints')) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
        chart.data.datasets[1].data.shift();
        chart.update();
    }
}
function removeDataRpm(chart) {
    if (chart.data.datasets[0].data.length > store.get('countChartPoints')) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
        chart.update();
    }
}

function connectSocket(ip) {
    if (port) {
        portClose();
    }
    connectWindowHide();
    port = new net.Socket();
    port.connect(80, ip, function () {
        console.log('Connected Wifi');
        pingMkTimer = setInterval(() => port.write('$1\n'), 1000);
        port.write('$1\n');
        port.write('$8\n');
        port.write('$9\n');
    });

    port.on('data', function (data) {
        readFromPort(data)
    });

    port.on('close', function () {
        console.log('Connection closed');
        portClose();
    });
}

/////////////Калибровка
$('#calibrateBack').on('click', function () {
    port.write('$2\n');
    $('.js-window').hide();
    $('#controlWindow').fadeIn(300);
});
$('#startCalibrate').on('click', function () {
    $('.js-window').hide();
    $('#calibrateWindow').fadeIn(300);
});

$('#calibrate-step-2').on('click', function () {
    $('.js-calibrate-step-1').hide();
    $('.js-calibrate-step-2').fadeIn(300);
    port.write('$15\n');
});

$('#calibrate-step-3').on('click', function () {
    if (parseFloat($('#controlWeight').val()) > 0) {
        $('#controlWeight').removeClass('is-invalid').addClass('is-valid').prop('disabled', true);
    } else {
        $('#controlWeight').addClass('is-invalid')
    }
    $(this).hide();
    $('.js-calibrate-step-3').fadeIn(300);
});

$('#calibrate-step-4').on('click', function () {
    $('#calibrate-step-4').hide();
    $('.js-calibrate-step-4').fadeIn(300);
    port.write('$16;' + parseFloat($('#controlWeight').val()) + '\n');
});

$('#calibrateSuccess').on('click', function () {
    port.write('$13;' + $('#calibrateFactor').text().trim() + '\n');
    port.write('$10\n');
    $('.js-calibrate-step-5').hide();
    $('.js-calibrate-step-6').fadeIn(300);
});
$('#calibrateFinish').on('click', function () {
    $('.js-window').hide();
    $('#controlWindow').fadeIn(300);
});
$('#additionalMeasure').on('click', function () {
    $('.js-additional-measure-1').hide();
    $('.js-additional-measure-2').fadeIn(300);
});
$('#startAdditionalMeasure').on('click', function () {
    $('.js-additional-measure-2').hide();
    $('.js-additional-measure-3').fadeIn(300);
    port.write('$17\n');
});
$('#additionalMeasureToo').on('click', function () {
    $('.js-additional-measure-3').hide();
    $('.js-additional-measure-2').fadeIn(300);
});
$('#calibrateIncorrect').on('click', function () {
    $('.js-calibrate-step-5').hide();
    $('#calibrate-step-4').fadeIn(300);
    $('.js-calibrate-step-3').fadeIn(300);
    // port.write('$15\n');
});

function getCalibrateFactor(data) {
    $('.js-calibrate-step-4').hide();
    $('.js-calibrate-step-5').fadeIn(300);
    $('#calibrateFactor').text(data);
}

function getGramms(data) {
    $('#measureControlWeight').text(data);
    $('.js-measure-weight').text(data);
}