(() => {
  'use strict';
  const hash = new URLSearchParams(location.hash.slice(1));
  let token = hash.get('convite') || '';
  if (!token) return; // The faithful preview has no pilot UI without a token.
  history.replaceState(null, '', location.pathname + location.search);
  const panel = document.createElement('section'); panel.className = 'dez-pilot-panel'; panel.id = 'convite-especial'; panel.tabIndex = -1;
  panel.setAttribute('aria-label', 'Convite especial de experimentação');
  panel.innerHTML = '<strong></strong><p class="dez-pilot-result" role="status" aria-live="polite"></p><button class="dez-pilot-resume" type="button" hidden>Retomar boas-vindas</button> <button class="dez-pilot-interest" type="button" hidden>Quero experimentar a plataforma</button> <button class="dez-pilot-start" type="button" hidden>Iniciar minha adesão</button><p class="dez-pilot-note">O convite não substitui a confirmação de identidade nem os termos obrigatórios.</p>';
  panel.querySelector('strong').textContent = document.currentScript?.getAttribute('data-environment') === 'homolog' ? 'HOMOLOG · Convite especial' : 'DEZ Soluções · Convite especial';
  // The invitation belongs in the journey, not after the footer. Keep the skip link
  // exclusively for its accessibility purpose.
  const journey = document.getElementById('como-comecar');
  if (journey) journey.before(panel); else document.querySelector('main').append(panel);
  const invitationLink = document.createElement('a'); invitationLink.className = 'text-link'; invitationLink.href = '#convite-especial'; invitationLink.textContent = 'Ir para o convite';
  document.querySelector('.hero-actions').append(invitationLink);
  function focusInvitation() { panel.focus({ preventScroll: true }); panel.scrollIntoView({ block: 'start', behavior: 'instant' }); }
  invitationLink.addEventListener('click', e => { e.preventDefault(); focusInvitation(); });
  const result = panel.querySelector('.dez-pilot-result'), interest = panel.querySelector('.dez-pilot-interest'), resume = panel.querySelector('.dez-pilot-resume');
  const start = panel.querySelector('.dez-pilot-start');
  let starting = false;
  let pending = true, available = false, interested = false;
  async function action(name) {
    const sentToken = token;
    const response = await fetch('/api/experimentacao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: sentToken, action: name }), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
    const body = await response.json();
    if (sentToken !== token) throw new Error('O convite foi alterado. Confira as boas-vindas atuais.');
    if (!response.ok) { const error = new Error(response.status === 404 ? 'Convite indisponível, expirado ou cancelado. Você pode continuar conhecendo a DEZ.' : response.status === 429 ? 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' : 'Não foi possível registrar. Tente novamente.'); error.unavailable = response.status === 404; throw error; }
    return body;
  }
  const dialog = document.createElement('dialog'); dialog.className = 'dez-pilot-dialog';
  dialog.setAttribute('aria-labelledby', 'dez-pilot-title'); dialog.setAttribute('aria-describedby', 'dez-pilot-message');
  dialog.innerHTML = '<button class="dez-pilot-close" type="button" aria-label="Fechar boas-vindas">×</button><span class="dez-pilot-eyebrow">DEZ SOLUÇÕES · CONVITE ESPECIAL</span><h2 id="dez-pilot-title"></h2><div id="dez-pilot-message"><p>A DEZ Soluções está evoluindo sua plataforma de gestão e você foi convidado a participar dessa construção.</p><p>Queremos que você vivencie a experiência real, explore os recursos disponíveis e contribua com suas percepções para aprimorar nossa solução.</p><p>Durante essa jornada, você poderá contar com o apoio de Ricardo e da DEZ Soluções.</p></div><p class="dez-pilot-dialog-error" role="alert"></p><button class="dez-pilot-accept" type="button">Quero conhecer a DEZ Soluções</button><p class="dez-pilot-note">Confirmar estas boas-vindas não é aceite contratual nem liberação de acesso.</p>';
  document.body.append(dialog);
  const accept = dialog.querySelector('.dez-pilot-accept');
  function close() {
    dialog.close();
    // Closing or Escape is purely visual: never acknowledge, refuse or record interest.
    focusInvitation();
  }
  dialog.querySelector('.dez-pilot-close').addEventListener('click', close);
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  accept.addEventListener('click', async () => {
    accept.disabled = true;
    try { const body = await action('acknowledge'); render(body, false); close(); }
    catch (e) { failure(e); if (dialog.open) dialog.querySelector('.dez-pilot-dialog-error').textContent = e.message; }
    finally { accept.disabled = false; }
  });
  interest.addEventListener('click', async () => {
    interest.disabled = true;
    try { const body = await action('interest'); render(body, false); result.textContent = body.message; result.tabIndex = -1; result.focus(); }
    catch (e) { failure(e); }
    finally { interest.disabled = false; }
  });
  start.addEventListener('click', async () => {
    if (starting) return;
    starting = true; start.disabled = true;
    try {
      const body = await action('startAdmission');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) throw new Error('Não foi possível iniciar. Tente novamente.');
      if (body.delivery === 'FAILED') throw new Error('Não foi possível enviar a confirmação ao e-mail autorizado. Aguarde um minuto para tentar novamente ou fale com quem enviou o convite.');
      // Only a reference crosses this navigation; email proof remains server-enforced.
      location.assign('/adesao#id=' + body.id + '&from=convite');
    } catch (e) { failure(e); starting = false; start.disabled = false; }
  });
  function render(body, autoOpen) {
    available = true; pending = !body.acknowledged; interested = !!body.interested;
    dialog.querySelector('h2').textContent = `${body.firstName}, queremos convidar você para uma experiência especial.`;
    resume.hidden = !pending; resume.textContent = 'Retomar boas-vindas'; interest.hidden = interested || !!body.canStartAdmission; start.hidden = !body.canStartAdmission;
    if (!pending && dialog.open) close();
    result.textContent = body.canStartAdmission ? 'Sua adesão já está autorizada. Inicie para receber a confirmação no e-mail autorizado e continuar com segurança.' : interested ? 'Seu interesse já está registrado e disponível para Ricardo no painel. Aguarde a autorização e as orientações para confirmar seu e-mail e iniciar a adesão.' : pending ? 'Boas-vindas pendentes. Fechar a janela não confirma nem recusa o convite. Você pode retomá-la abaixo.' : 'Boas-vindas confirmadas. Conheça a DEZ e manifeste seu interesse quando desejar.';
    // Interest is independent of the initial welcome acknowledgment.
    if (autoOpen && pending && !dialog.open) { dialog.showModal(); accept.focus(); }
    else if (autoOpen && !pending) focusInvitation();
  }
  function failure(error) {
    result.textContent = error.message;
    if (error.unavailable) { available = false; pending = false; resume.hidden = true; interest.hidden = true; start.hidden = true; if (dialog.open) dialog.close(); token = ''; }
    else if (!available) { resume.hidden = false; resume.textContent = 'Tentar novamente'; }
  }
  async function inspect() { try { render(await action('inspect'), true); } catch (e) { failure(e); if (!dialog.open) focusInvitation(); } }
  resume.addEventListener('click', () => { void inspect(); });
  addEventListener('pageshow', event => { if (event.persisted && token) void inspect(); });
  addEventListener('hashchange', () => {
    const next = new URLSearchParams(location.hash.slice(1)).get('convite');
    if (next) { token = next; available = false; if (dialog.open) dialog.close(); history.replaceState(null, '', location.pathname + location.search); void inspect(); }
  });
  // Keep only in-memory state while this document is in the back/forward cache.
  // No pagehide cleanup that destroys a pending invitation; no token persistence in browser storage.
  void inspect();
})();
