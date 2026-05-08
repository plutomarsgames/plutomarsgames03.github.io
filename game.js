const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let gameStarted = false;

document.getElementById("playBtn").addEventListener("click", () => {
  document.getElementById("menu").style.display = "none";
  gameStarted = true;
});

const keys = {};

window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
});

window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

const car = {
  x: canvas.width / 2,
  y: canvas.height - 150,
  width: 50,
  height: 90,
  speed: 0,
  maxSpeed: 10
};

let roadOffset = 0;

function drawRoad() {
  ctx.fillStyle = "#555";
  ctx.fillRect(canvas.width / 2 - 180, 0, 360, canvas.height);

  ctx.strokeStyle = "white";
  ctx.lineWidth = 5;
  ctx.setLineDash([30, 20]);

  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();

  ctx.setLineDash([]);
}

function drawCar() {
  ctx.fillStyle = "#00ffcc";
  ctx.fillRect(car.x - car.width / 2, car.y - car.height / 2, car.width, car.height);

  ctx.fillStyle = "black";

  ctx.fillRect(car.x - 25, car.y - 40, 10, 20);
  ctx.fillRect(car.x + 15, car.y - 40, 10, 20);
  ctx.fillRect(car.x - 25, car.y + 20, 10, 20);
  ctx.fillRect(car.x + 15, car.y + 20, 10, 20);
}

function updateCar() {
  if (keys["w"]) {
    car.speed += 0.2;
  }

  if (keys["s"]) {
    car.speed -= 0.2;
  }

  if (keys["a"]) {
    car.x -= 5;
  }

  if (keys["d"]) {
    car.x += 5;
  }

  if (car.speed > car.maxSpeed) {
    car.speed = car.maxSpeed;
  }

  if (car.speed < 0) {
    car.speed = 0;
  }

  car.speed *= 0.98;

  roadOffset += car.speed;
}

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawRoad();

  if (gameStarted) {
    updateCar();
  }

  drawCar();

  requestAnimationFrame(gameLoop);
}

gameLoop();
