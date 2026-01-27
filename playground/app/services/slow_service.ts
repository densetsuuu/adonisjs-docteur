// Synchronous blocking delay during module load
// const delay = 150 // ms - above the 100ms threshold
// const start = Date.now()
// while (Date.now() - start < delay) {
//   // Busy-wait to simulate slow module initialization
// }

export class SlowService {
  greet() {
    return 'Hello from slow service'
  }
}
