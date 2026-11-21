// Start-up and main loop.
(function (MH) {
  'use strict';
  window.addEventListener('load', () => {
    MH.loadSettings();
    MH.tex.init();
    MH.input.init();
    const game = new MH.Game(document.getElementById('game'));
    MH.game = game;
    MH.ui.init(game);
    MH.ui.showMainMenu();

    // Save when the tab is closed or hidden.
    const autosave = () => { if (game.state && game.mode !== 'menu') game.save(); };
    window.addEventListener('beforeunload', autosave);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { autosave(); if (game.mode === 'playing') MH.ui.showPause(); }
    });

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      game.frame(dt);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
})(window.MH);
