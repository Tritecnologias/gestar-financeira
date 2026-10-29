(() => {
  'use strict';
  const hash = new URLSearchParams(location.hash.slice(1));
  let token = hash.get('convite') || '';
  if (!token) return; // The faithful preview has no pilot UI without a token.
  history.replaceState(null, '', location.pathname + location.search);
  const panel = document.createElement('section'); panel.className = 'dez-pilot-panel';
  panel.setAttribute('aria-label', 'Convite especial de experimentação');
  panel.innerHTML = '<strong>Experiência de HOMOLOG · Convite especial</strong><p class="dez-pilot-result" role="status" aria-live="polite"></p><button class="dez-pilot-interest" type="button" hidden>Quero experimentar a plataforma</button><p class="dez-pilot-note">Este convite não cria conta ou acesso e não substitui os termos. Nenhum e-mail será enviado.</p>';
  document.body.append(panel);
  const result = panel.querySelector('.dez-pilot-result'), interest = panel.querySelector('button');
  async function action(name) {
    const response = await fetch('/api/experimentacao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: name }), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
    const body = await response.json();
    if (!response.ok) throw new Error(response.status === 404 ? 'Convite indisponível, expirado ou revogado. Você pode continuar conhecendo a DEZ.' : 'Não foi possível registrar. Tente novamente.');
    return body;
  }
  const dialog = document.createElement('dialog'); dialog.className = 'dez-pilot-dialog';
  dialog.setAttribute('aria-labelledby', 'dez-pilot-title'); dialog.setAttribute('aria-describedby', 'dez-pilot-message');
  dialog.innerHTML = '<button class="dez-pilot-close" type="button" aria-label="Fechar boas-vindas">×</button><span class="dez-pilot-eyebrow">DEZ SOLUÇÕES · CONVITE ESPECIAL</span><h2 id="dez-pilot-title"></h2><div id="dez-pilot-message"><p>A DEZ Soluções está evoluindo sua plataforma de gestão e você foi convidado a participar dessa construção.</p><p>Queremos que você vivencie a experiência real, explore os recursos disponíveis e contribua com suas percepções para aprimorar nossa solução.</p><p>Durante essa jornada, você poderá contar com o apoio de Ricardo e da DEZ Soluções.</p></div><p class="dez-pilot-dialog-error" role="alert"></p><button class="dez-pilot-accept" type="button">Quero conhecer a DEZ Soluções</button><p class="dez-pilot-note">Confirmar estas boas-vindas não é aceite contratual nem liberação de acesso.</p>';
  document.body.append(dialog);
  const accept = dialog.querySelector('.dez-pilot-accept');
  function close() { dialog.close(); interest.focus(); }
  dialog.querySelector('.dez-pilot-close').addEventListener('click', close);
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  accept.addEventListener('click', async () => {
    accept.disabled = true;
    try { await action('acknowledge'); result.textContent = 'Boas-vindas confirmadas. Conheça a DEZ e, quando desejar, manifeste seu interesse abaixo.'; close(); }
    catch (e) { dialog.querySelector('.dez-pilot-dialog-error').textContent = e.message; }
    finally { accept.disabled = false; }
  });
  interest.addEventListener('click', async () => {
    interest.disabled = true;
    try { const body = await action('interest'); result.textContent = body.message; interest.hidden = true; result.tabIndex = -1; result.focus(); }
    catch (e) { result.textContent = e.message; interest.disabled = false; }
  });
  action('inspect').then(body => {
    dialog.querySelector('h2').textContent = `${body.firstName}, queremos convidar você para uma experiência especial.`;
    interest.hidden = body.interested;
    result.textContent = body.interested ? 'Seu interesse já está registrado e disponível para Ricardo no painel.' : 'Conheça a landing e manifeste seu interesse quando desejar. O acesso depende de convite separado.';
    if (!body.acknowledged && !body.interested) { dialog.showModal(); accept.focus(); }
  }).catch(e => { result.textContent = e.message; dialog.remove(); token = ''; });
  addEventListener('pagehide', () => { token = ''; dialog.remove(); panel.remove(); }, { once: true });
})();
