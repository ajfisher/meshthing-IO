var Meshthing = require("../lib/meshthing");

console.log("Running blink");

console.log("Firing up the mt");

var board = new Meshthing({
    host: "mt2",
    port: 4000
});


board.on("ready", function() {
    console.log("BLINK -> READY");

    var byte = 0;

    this.pinMode("D13", this.MODES.OUTPUT);

    setInterval(function() {
        this.digitalWrite("D13", (byte ^= 1));
    }.bind(this), 1000);

}); 

board.on("error", function() {
    console.log("BLINK -> ERROR");
});
