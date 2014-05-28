var es6 = require("es6-shim");
var os = require("os");
var net = require("net");
var dgram = require("dgram");
var Emitter = require("events").EventEmitter;
var https = require("https");
var priv = new Map();

var errors = {

}

var pins = [
    { id: "D0", modes: [0, 1, 3, 4] },
    { id: "D1", modes: [0, 1, 3, 4] },
    { id: "D2", modes: [0, 1] },
    { id: "D3", modes: [0, 1] },
    { id: "D4", modes: [0, 1] },
    { id: "D5", modes: [0, 1] },
    { id: "D6", modes: [0, 1] },
    { id: "D7", modes: [0, 1] },

    { id: "", modes: [] },
    { id: "", modes: [] },

    { id: "A0", modes: [0, 1, 2, 3, 4] },
    { id: "A1", modes: [0, 1, 2, 3, 4] },
    { id: "A2", modes: [0, 1, 2] },
    { id: "A3", modes: [0, 1, 2] },
    { id: "A4", modes: [0, 1, 2] },
    { id: "A5", modes: [0, 1, 2, 3, 4] },
    { id: "A6", modes: [0, 1, 2, 3, 4] },
    { id: "A7", modes: [0, 1, 2, 3, 4] }
];

var modes = Object.freeze({
    INPUT: 0,
    OUTPUT: 1,
    ANALOG: 2,
    PWM: 3,
    SERVO: 4
});

var DIGITAL_READ = 0x03;
var ANALOG_READ = 0x04;

function Meshthing(opts) {

    console.log("Creating mt prototype");

    Emitter.call(this);

    if (!(this instanceof Meshthing)) {
        return new Meshthing(opts);
    }

    var state = {
        isConnected: false, // TODO: need to think about how we get an ack
        isReading: false, // TODO: possibly not needed
        //service: service(opts.deviceId), // looks like a spark thing
        host: opts.host || null,
        port: opts.port || 4000,
        client: null,
        server: null
    };

    this.name = "meshthing-io";
    this.buffer = [];
    this.isReady = false;

    this.pins = pins.map(function(pin) {
        return {
            supportedModes: pin.modes,
        mode: pin.modes[0],
        value: 0
        };
    });

    this.analogPins = this.pins.slice(10).map(function(pin, i) {
        return i;
    });

    // Store private state
    priv.set(this, state);

    var afterCreate = function(error) {
        if (error) {
            this.emit("error", error);
        } else {
            console.log("After created and we're now connected");
            state.isConnected = true;
            this.emit("connect");
        }
    }.bind(this);

    this.connect(function(error, data) {
        console.log( "connect -> connect -> handler" );

        // what do we do here because we don't get any sort of ack back....

        if (error !== undefined && error !== null) {
            this.emit("error", error);
        } else {
            console.log("TODO: niavely processing this as there's nothing acked");
            console.log("processing the connection response to get any data required");
            // Moving into after connect so we can obtain any further details.
            Meshthing.Client.create(this, afterCreate);
        }
    }.bind(this));
}

Meshthing.Client = {
    create: function(meshthing, afterCreate) {
        // TODO: this is basically setting up the actual client
        if (!(meshthing instanceof Meshthing)) {
            throw new Error(errors.instance);
        }

	    console.log("Creating the meshthing object");
        var state = priv.get(meshthing);
        var connection = {
            host: state.host,
            port: state.port
        };


        // TODO: Set up a udp server here so we can listen for messages
        var server = dgram.createSocket('udp6');
        console.log("attempting to create a UDP server now");
        server.on("error", function(error) {
            console.log("Error" + error);
            meshthing.emit("error", error);
            server.close();
        });

        server.on('listening', function() {
            var address = server.address();
            console.log("Listening at: " + address.address + ":" + address.port);
            meshthing.isReady = true;
            meshthing.emit("ready");
        });

        server.bind();

        state.server = server;

        // TODO: All of this implies a direct connection.
        var socket = net.connect(connection, function() {
            // TODO: allow these messages to be suppressed.

            // socket.setKeepAlive(true);

            // Set ready state bit
            meshthing.isReady = true;

            meshthing.emit("ready");

            if (!state.isReading) {
                state.isReading = true;
                socket.on("data", function(data) {
                    processReceived(meshthing, data); // TODO: look at this
                });
            }
        });
        state.socket = socket;

        afterCreate();
    }
};

Meshthing.prototype = Object.create(Emitter.prototype, {
    constructor: {
        value: Meshthing
    },
    MODES: {
        value: modes
    },
    HIGH: {
        value: 1
    },
    LOW: {
        value: 0
    }
});

Meshthing.prototype.connect = function(handler) {

    console.log("attempting to connect and send a UDP message");
    // TODO: FIX ALL OF THIS.
    var state = priv.get(this);

    if (state.isConnected) {
        return this;
    }
    handler = handler.bind(this);


    // send a message that will set the neop green basically.
    var message = new Buffer ('(data 3)'); // TODO: Make this some sort of real message for connection 

    state.client = dgram.createSocket('udp6');
    state.client.bind(0);

    state.client.send(message, 0, message.length, state.port, state.host,
        function(error, bytes) {
            var err;
            if (error) {
                if (handler) {
                    handler(error);
                } else {
                    throw error;
                }
            } else {
                console.log('Message sent to: "' + state.host +'", port: '+ state.port);
                //state.client.close();
                if (handler) {
                    handler(err, bytes);
                }
            }
    });

    return this;
};

Meshthing.prototype.disconnect = function(handler){
    console.log("Attempting disconnect");

    var state = priv.get(this);

    state.client.close();
    state.server.close();


}

Meshthing.prototype.pinMode = function(pin, mode) {
  var state = priv.get(this);
  var buffer;
  var offset;
  var pinInt;
  var sMode;

  sMode = mode = +mode;

  // Normalize when the mode is ANALOG (2)
  if (mode === 2) {
    sMode = 0;

    // Normalize to pin string name if numeric pin
    if (typeof pin === "number") {
      pin = "A" + pin;
    }
  }

    // TODO: HAVE A LOOK AT THIS FOR MT perspective
  // voodoospark expects PWM (3), SERVO (4) to be OUTPUT (1)
  if (mode === 4 || mode === 3) {
    sMode = 1;
  }

  offset = pin[0] === "A" ? 10 : 0;
  pinInt = (pin.replace(/A|D/, "") | 0) + offset;

  this.pins[pinInt].mode = mode;

  buffer = new Buffer([ 0x00, pinInt, sMode ]);

  // console.log(buffer);
  state.socket.write(buffer);

  return this;
};

Meshthing.prototype.digitalWrite = function(pin, value) {
    console.log("digital write pin: " + pin + " val: " + value);
    var action = 0x01;
    var state = priv.get(this);
    var pinInt = pin.replace("/A|D/i", "");
        
    var message = new Buffer ('(data ' + (value+1) + ')'); // TODO: Make this some sort of real message for connection 

    state.client.send(message, 0, message.length, state.port, state.host, function(error, bytes) {
        if (error) {
            throw error;
        } else {
            console.log('Blink message sent to: "' + state.host +'", port: '+ state.port);
        }
    });

}

Meshthing.prototype.analogWrite = function(pin, value) {
    console.log("analog write pin: " + pin + " val: " + value);
}


Meshthing.prototype.digitalRead = function(pin) {
    console.log("digital read pin: " + pin);
}
Meshthing.prototype.analogRead = function(pin) {
    console.log("analog read pin: " + pin);
}

Meshthing.prototype.servoWrite = Meshthing.prototype.analogWrite;

module.exports = Meshthing;
