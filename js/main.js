import * as time from '/js/time.js'
import * as pbar from '/js/progress-bar.js'

window.onload = async function() {
	if ('serviceWorker' in navigator) {
		navigator.serviceWorker.register('/sw.js').then(function(registration) {
			console.log("registered");
		});
	}

	// In the following line, you should include the prefixes of implementations you want to test.

	// Moreover, you may need references to some window.IDB* objects:
	window.IDBTransaction = window.IDBTransaction ||
		window.webkitIDBTransaction ||
		window.msIDBTransaction ||
		{READ_WRITE: "readwrite"};

	window.IDBKeyRange = window.IDBKeyRange ||
		window.webkitIDBKeyRange ||
		window.msIDBKeyRange;
	// (Mozilla has never prefixed these objects, so we don't need window.mozIDB*)

	if (!window.indexedDB) {
		console.log("indexdb not supported");
		return;
	}

	await update_task_ui();
	update_history_ui();

	if (document.getElementById("task-name").value != "") {
		on_running_start();
	}
}

var db_name = "database";

// tasks: name | description
// durations: name | start | stop | duration
// current: name | start

var table_tasks = "tasks";
var table_history = "history";
var table_running = "running";

var key_id = "id";
var key_name = "name";
var key_description = "desc";
var key_start = "start";
var key_end = "end";
var key_duration = "dur";
var key_day = "day";
var key_week = "week";
var key_month = "month";
var key_year = "year";

function db_create_cb(event)
{
	let db = event.target.result;
	let store = db.createObjectStore(table_tasks, {keyPath: 'name'});
	store.createIndex(key_name, key_name, { unique: true });
	store.createIndex(key_description, key_description, { unique: false });

	store = db.createObjectStore(table_history, {keyPath: 'id', autoIncrement: true});
	store.createIndex(key_name, key_name, { unique: false });
	store.createIndex(key_start, key_start, { unique: false });

	store = db.createObjectStore(table_running, {keyPath: 'id'});
}

function db_request(table, version, db_request, work)
{
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(db_name, version);
		request.onerror = function(event) {
			reject("error");
		};
		request.onupgradeneeded = function(event) {
			db_create_cb(event);
		};
		request.onsuccess = function(event) {
			var result_array = undefined;
			db_request(request.result).onsuccess = function(event) {
				let result = event.target.result;

				if (result instanceof IDBCursor) {
					if (work) {
						work(result.value);
					}
					if (result_array == undefined) {
						result_array = Array.from([result.value]);
					} else {
						result_array.push(result.value);
					}
					result.continue();
					return;
				}

				// close db connection
				request.result.close();

				if (result_array != undefined) {
					resolve(result_array);
				} else {
					resolve(result);
				}
			};
		};
	});
}

function db_get(table, index, value)
{
	return db_request(table, 1, function(db) {
		if (value == undefined)
			return db.transaction(table).objectStore(table).get(index);
		else
			return db.transaction(table).objectStore(table).index(index).get(value);
	});
}

function db_put(table, value)
{	
	return db_request(table, 1, function(db) {
		return db.transaction(table, "readwrite").objectStore(table).put(value)
	});
}

function db_delete(table, key)
{	
	return db_request(table, 1, function(db) {
		return db.transaction(table, "readwrite").objectStore(table).delete(key)
	});
}

// loop with filter
// var singleKeyRange = IDBKeyRange.only("Donna");
// var lowerBoundKeyRange = IDBKeyRange.lowerBound("Bill");
// var lowerBoundOpenKeyRange = IDBKeyRange.lowerBound("Bill", true);
// var upperBoundOpenKeyRange = IDBKeyRange.upperBound("Donna", true);
// var boundKeyRange = IDBKeyRange.bound("adam", "mahdis", false, false);
function db_foreach(table, index, bounds, work)
{
	return db_request(table, 1, function(db) {
		return db.transaction(table, "readwrite").objectStore(table).index(index).openCursor(bounds)
	}, work);
}

async function push_running(task)
{
	let t = {
		[key_id]: 1,
		[key_name]: task[key_name],
		[key_start]: new Date().getTime()
	};

	await db_put(table_running, t);
}

async function pop_running()
{
	let task = await db_get(table_running, 1);
	if (task == undefined) {
		return;
	}

	db_delete(table_running, 1);

	let t = {
		[key_name]: task[key_name],
		[key_start]: task[key_start],
		[key_end]: new Date().getTime()
	};

	return t;
}

async function create_task(task_name, task_description)
{
	let t = {
		[key_name]: task_name,
		[key_description]: task_description
	};

	await db_put(table_tasks, t);

	return t;
}

async function save_task(task_name, task_start, task_end)
{
	let date = new Date(task_start);

	let t = {
		[key_name]: task_name,
		[key_start]: task_start,
		[key_end]: task_end,
		[key_duration]: task_end - task_start,
		[key_day]: date.getDay() + 1,
		[key_week]: time.getWeekNumber(new Date(task_start)),
		[key_month]: date.getMonth() + 1,
		[key_year]: date.getYear() + 1
	};

	await db_put(table_history, t);
}

async function on_task_stop()
{
	let running = await pop_running();
	if (running != undefined) {
		await save_task(running[key_name], running[key_start], running[key_end]); 
	}

	on_running_stop();

	update_task_ui(running[key_name]);
	update_history_ui();
}

async function on_task_start()
{
	let running = await pop_running();

	// save old task
	if (running != undefined)
	{
		await save_task(running[key_name], running[key_start], running[key_end]);
	}

	// start a task
	let task_name = document.getElementById("task-name").value;
	if (task_name != undefined) {
		// check if task already exists
		let task = await db_get(table_tasks, task_name);

		// if not create it
		if (task == undefined) {
			let task_description = document.getElementById("task-description").value;
			task = await create_task(task_name, task_description)
		}
		await push_running(task);
	}

	update_task_ui();
	update_history_ui();

	on_running_start();
}

var interval;
function on_running_start()
{
	interval = setInterval(update_progress_ui, 1000);
}

function on_running_stop()
{
	clearInterval(interval);
	interval = undefined;
}

async function update_task_ui(task_name)
{
	// if undefined was passed we will display running task or last task ran
	if (task_name == undefined) {
		let running = await db_get(table_running, 1);
		if (running == undefined) {
			task_name = "";
		} else {
			task_name = running[key_name];
		}
		document.getElementById("task-name").value = task_name;
	}

	let button = document.getElementById("task-update");
	button.removeEventListener("click", on_task_stop);
	button.removeEventListener("click", on_task_start);

	// if task is not specified grey out button
	if (task_name == undefined || task_name == "") {
		button.value = "";
		document.getElementById("task-description").value = "";
		return;
	}

	// if task does not exists allow start
	let task = await db_get(table_tasks, task_name);
	if (task == undefined) {
		button.addEventListener("click", on_task_start)
		button.value = "start";
		return;
	}

	// show tasks description
	document.getElementById("task-description").value = task[key_description];

	task = await db_get(table_running, 1);
	// if task is running allow stop
	if (task != undefined && task[key_name] == task_name) {
		button.addEventListener("click", on_task_stop);
		button.value = "stop";
	} else {
		button.addEventListener("click", on_task_start)
		button.value = "resume";
	}
}

async function update_history_ui()
{
	let table = document.getElementById("id-table-history");
	table.innerHTML = "";

	let day_start = new Date();
	day_start.setHours(0);
	day_start.setMinutes(0);
	day_start.setSeconds(0);

	let results = await db_foreach(table_history, key_start, IDBKeyRange.lowerBound(day_start.getTime(), true));

	let fields = [key_name, key_start, key_duration];

	results.forEach(element => {
		let row = table.insertRow(table.rows.length);

		fields.forEach(field => {
			let c = row.insertCell(row.cells.length);

			let val = element[field];

			if (field == key_start)
				val = new Date(val).toTimeString().split(" ")[0];

			if (field == key_duration) {
				let ms = val;
				let s = Math.floor(ms / 1000);
				let m = Math.floor(s / 60);
				let h = Math.floor(m / 60);
				let dur = [
					h % 60,
					m % 60,
					s % 60
				];
				val = dur[0].toString() + "h " +
					dur[1].toString() + "m " +
					dur[2].toString() + "s";
			}
			
			c.innerHTML = val;
		});
	});
}

async function update_progress_ui()
{
	let running = await db_get(table_running, 1);
	if (running == undefined) {
		return;
	}

	let runtime = Math.floor((new Date().getTime() - running[key_start]) / 1000);
	document.getElementById("task-update").value = time.toDuration(runtime);
}

document.getElementById("task-name").addEventListener("input", function(ev) {
	update_task_ui(ev.target.value);
});

document.getElementById("task-name").addEventListener("focusout", function(ev) {
	if (ev.target.value == "")
		update_task_ui()
});

document.getElementById("dummy-test").addEventListener("click", function(ev) {
	pbar.runTest("progress-bar")
});
