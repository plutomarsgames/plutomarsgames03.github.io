let car = document.getElementById("car");
let gameArea = document.getElementById("gameArea");
let scoreDisplay = document.getElementById("score");

let carX = 130;
let score = 0;
let gameRunning = true;

document.addEventListener("keydown", moveCar);

function moveCar(e) {
  if (!gameRunning) return;

  if (e.key === "ArrowLeft" && carX > 0) {
    carX -= 20;
  }
  if (e.key === "ArrowRight" && carX < 260) {
    carX += 20;
  }
  car.style.left = carX + "px";
}

// Create enemies
function createEnemy() {
  if (!gameRunning) return;

  let enemy = document.createElement("div");
  enemy.classList.add("enemy");
  enemy.style.left = Math.floor(Math.random() * 260) + "px";

  gameArea.appendChild(enemy);

  let enemyY = -80;

  let move = setInterval(() => {
    if (!gameRunning) {
      clearInterval(move);
      return;
    }

    enemyY += 5;
    enemy.style.top = enemyY + "px";

    // Collision
    let carRect = car.getBoundingClientRect();
    let enemyRect = enemy.getBoundingClientRect();

    if (
      carRect.left < enemyRect.right &&
      carRect.right > enemyRect.left &&
      carRect.top < enemyRect.bottom &&
      carRect.bottom > enemyRect.top
    ) {
      alert("Game Over! Score: " + score);
      gameRunning = false;
      location.reload();
    }

    if (enemyY > 500) {
      enemy.remove();
      score++;
      scoreDisplay.innerText = score;
      clearInterval(move);
    }
  }, 20);
}

// Spawn enemies
setInterval(createEnemy, 1500);
