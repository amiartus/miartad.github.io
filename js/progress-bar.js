const PROGRESS_BAR_ID = "progress-bar"

function getTasksWithPortions(allTasks) {
	const allTasksCopy = JSON.parse(JSON.stringify(allTasks))
	const tasksWithPortions = allTasksCopy.map(appendPortionToTask)

	return tasksWithPortions
}

function appendPortionToTask(task) {
	const portion = (task.stop - task.start) * 100
	task.portion = portion

	return task
}

function renderPortionsInProgressBar(tasksWithPortions) {
	const bar = document.getElementById(PROGRESS_BAR_ID)

	//may have child elements from previous progress-bar render, have to empty first
	bar.innerHTML = ""

	tasksWithPortions.forEach(function (taskObj) {
		bar.append(createElementWithWidth(taskObj))
	})
}

function createElementWithWidth(task) {
	const el = document.createElement("div")
	el.className = "portion"
	el.style.width = task.portion + "%" || 0
	el.style.height = "50px"
	el.style.backgroundColor = task.color

	return el
}

function runTest() {
	const a = Math.random()
	const b = Math.random()

	const min = Math.min(a, b)
	const max = Math.max(a, b)

	const dummyData = [
		{ start: 0, stop: min, color: "#3598db" },
		{ start: min, stop: max, color: "red" },
		{ start: max, stop: 1, color: "#26af61" },
	]

	render(dummyData)
}

export function render(tasks) {
	const atom = getTasksWithPortions(tasks)
	renderPortionsInProgressBar(atom)
}
