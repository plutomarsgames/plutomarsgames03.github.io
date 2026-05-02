// scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);

// camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.set(0,5,10);

// renderer
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// light
const light = new THREE.DirectionalLight(0xffffff,1);
light.position.set(10,20,10);
scene.add(light);

// ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200,200),
  new THREE.MeshStandardMaterial({color:0x333333})
);
ground.rotation.x = -Math.PI/2;
scene.add(ground);

// TEMP CAR (BOX)
const car = new THREE.Mesh(
  new THREE.BoxGeometry(1,0.5,2),
  new THREE.MeshStandardMaterial({color:0xff0000})
);
car.position.y = 0.3;
scene.add(car);

// controls
let speed = 0;
let turn = 0;

document.addEventListener("keydown", (e)=>{
  if(e.key==="ArrowUp") speed += 0.02;
  if(e.key==="ArrowDown") speed -= 0.02;
  if(e.key==="ArrowLeft") turn += 0.03;
  if(e.key==="ArrowRight") turn -= 0.03;
});

// loop
function animate(){
  requestAnimationFrame(animate);

  car.rotation.y += turn;
  car.position.x += Math.sin(car.rotation.y)*speed;
  car.position.z += Math.cos(car.rotation.y)*speed;

  camera.position.x = car.position.x;
  camera.position.z = car.position.z + 8;
  camera.lookAt(car.position);

  renderer.render(scene,camera);
}
animate();
