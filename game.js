let car = document.getElementById("car");
let road = document.getElementById("road");
let scoreEl = document.getElementById("score");
let speedEl = document.getElementById("speed");
let gameArea = document.getElementById("gameArea");

let carX = 140;
let score = 0;
let speed = 5;
let gameRunning = true;

// Move car
document.addEventListener("keydown", e => {
  if (e.key === "ArrowLeft" && carX > 0) carX -= 20;
  if (e.key === "ArrowRight" && carX < 280) carX += 20;

  car.style.left = carX + "px";
});

// Road animation
let roadY = 0;
function moveRoad() {
  roadY += speed;
  road.style.top = roadY + "px";

  if (roadY > 600) roadY = 0;

  requestAnimationFrame(moveRoad);
}
moveRoad();

// Create enemies
function createEnemy() {
  if (!gameRunning) return;

  let enemy = document.createElement("img");
  enemy.src = "images/enemy.png";
  enemy.classList.add("enemy");
  enemy.style.left = Math.random() * 280 + "px";

  gameArea.appendChild(enemy);

  let enemyY = -100;

  let move = setInterval(() => {
    if (!gameRunning) return;

    enemyY += speed + 2;
    enemy.style.top = enemyY + "px";

    let carRect = car.getBoundingClientRect();
    let enemyRect = enemy.getBoundingClientRect();

    if (
      carRect.left < enemyRect.right &&
      carRect.right > enemyRect.left &&
      carRect.top < enemyRect.bottom &&
      carRect.bottom > enemyRect.top
    ) {
      alert("💀 Crash! Score: " + score);
      location.reload();
    }

    if (enemyY > 600) {
      enemy.remove();
      score++;
      speed += 0.2;

      scoreEl.innerText = score;
      speedEl.innerText = Math.floor(speed * 20);
      clearInterval(move);
    }

  }, 20);
}

setInterval(createEnemy, 1200);
