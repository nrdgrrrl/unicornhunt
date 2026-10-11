export function boot(canvas) {
  // Draw locally so the first runnable commit does not depend on future assets.
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff9e9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#292433';
  ctx.font = '30px cursive';
  ctx.textAlign = 'center';
  ctx.fillText('Unicorn Hunt', 320, 160);
  ctx.font = '18px cursive';
  ctx.fillText('Glitter Grove is growing…', 320, 200);
}
