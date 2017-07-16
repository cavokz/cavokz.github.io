var adb = {};

function paddit(text, width, padding)
{
	let padlen = width - text.length;
	let padded = "";
	let i;

	for (i = 0; i < padlen; i++)
		padded += padding;

	return padded + text;
}

function hexdump(view, prefix="")
{
	let decoder = new TextDecoder();
	let i, j;

	for (i=0; i < view.byteLength; ) {
		let row = prefix + paddit(i.toString(16), 4, "0") + " ";
		for (j = 0; j < 16; j++) {
			if (i + j < view.byteLength)
				row += " " + paddit(view.getUint8(i + j).toString(16), 2, "0");
			else
				row += "   ";
		}
		row += " | ";
		for (j = 0; j < 16; j++) {
			if (i + j < view.byteLength)
				row += decoder.decode(new DataView(view.buffer, i + j, 1));
			else
				row += " ";
		}
		console.log(row);
		i += 16;
	}
}

(function() {
	'use strict';

	adb.A_SYNC = 0x434e5953;
	adb.A_CNXN = 0x4e584e43;
	adb.A_OPEN = 0x4e45504f;
	adb.A_OKAY = 0x59414b4f;
	adb.A_CLSE = 0x45534c43;
	adb.A_WRTE = 0x45545257;

	adb.VERSION = 0x01000000;
	adb.MAX_PAYLOAD = 4096;
	adb.MAX_DATA_SIZE = 0x10000;

	adb.checksum = function(data) {
		let i, sum = 0;
		for (i = 0; i < data.byteLength; i++)
			sum += data.getUint8(i);
		return sum & 0xffffffff;
	};

	adb.Message = function(cmd, arg0, arg1, data = null) {
		this.cmd = cmd;
		this.arg0 = arg0;
		this.arg1 = arg1;
		this.data = data;
	};

	adb.Message.prototype.send = function(device, ep) {
		let header = new ArrayBuffer(24);
		let data = null;
		let len = 0;
		let checksum = 0;

		if (this.data != null && this.data != "") {
			data = new TextEncoder().encode(this.data);
			len = data.length;
			checksum = adb.checksum(new DataView(data.buffer));
		}

		let view = new DataView(header);
		view.setUint32(0, this.cmd, true);
		view.setUint32(4, this.arg0, true);
		view.setUint32(8, this.arg1, true);
		view.setUint32(12, len, true);
		view.setUint32(16, checksum, true);
		view.setUint32(20, this.cmd ^ 0xffffffff, true);

		console.log(this);
		hexdump(view, "==> ");
		hexdump(new DataView(data.buffer), "==> ");

		let seq = device.transferOut(ep, header);
		if (len > 0)
			seq.then(device.transferOut(ep, data));

		return seq;
	};

	adb.Message.receive = function(device, ep) {
		return device.transferIn(ep, 24).then(result => {
			let cmd = result.data.getUint32(0, true);
			let arg0 = result.data.getUint32(4, true);
			let arg1 = result.data.getUint32(8, true);
			let len = result.data.getUint32(12, true);
			let check = result.data.getUint32(16, true);
			let magic = result.data.getUint32(20, true);

			if (len == 0) {
				let m = new adb.Message(cmd, arg0, arg1);
				console.log(m);
				hexdump(result.data, "<== ");

				if ((cmd ^ magic) != -1)
					throw new Error("magic mismatch");

				return m;
			}

			return device.transferIn(ep, len).then(result2 => {
				let m = new adb.Message(cmd, arg0, arg1, result2.data);
				console.log(m);
				hexdump(result.data, "<== ");
				hexdump(result2.data, "<== ");

				if ((cmd ^ magic) != -1)
					throw new Error("magic mismatch");
				if (adb.checksum(result2.data) != check)
					throw new Error("checksum mismatch: " + adb.checksum(result2.data) + "!=" + check);

				return m;
			});
		});
	};
})();
