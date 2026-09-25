// pipe.js — generic cross-calc value handoff (the "_pipe" pattern, see
// CONTRIBUTING.md). Any calc's headline result can be sent to any other
// calc's input via a URL round trip — no shared state, no iframe, just
// query params. To make a field receive a piped value, give its input
// definition a `pipeFrom: '<source-calc-id>'` property (see
// heras-fencing.js's `qp_kPa` input for the worked example).
//
// Flow (consumer = the calc with the field that needs a value; producer =
// the calc that computes it):
//   1. Engineer clicks "Use output from <producer> calc" next to the
//      consumer's field. That opens the producer calc in a new tab with
//      `_pipe=<consumerCalcId>:<fieldName>` and `_pipeReturn=<consumer
//      page's current query string>`.
//   2. The producer calc sees `_pipe` and shows a "Send back" button next
//      to its headline result. Clicking it merges that value (plus a
//      `_piped` marker) into `_pipeReturn`'s params and navigates there.
//   3. Back on the consumer calc, the field named in `_piped` picks up
//      its new value automatically (it's just a normal query param, read
//      by the existing URL round-trip in initialValues()) and gets a
//      "sourced from <producer> calc — verify inputs" note.

// `consumerCalcId` is the calc that asked for the value (it has the field
// with `pipeFrom` set); `targetFieldName` is that field's name on it.
export function parsePipeRequest(params) {
  const pipe = params.get('_pipe');
  if (!pipe || !pipe.includes(':')) return null;
  const [consumerCalcId, targetFieldName] = pipe.split(':');
  return { consumerCalcId, targetFieldName, pipeReturn: params.get('_pipeReturn') || '' };
}

// Link on the CONSUMER calc's field: opens `producerCalcId`'s page,
// asking it to send a value back into `targetFieldName` here.
export function buildPipeRequestLink(producerCalcId, targetFieldName, label) {
  const currentParams = new URLSearchParams(window.location.search);
  const returnQuery = currentParams.toString();
  const pipeParams = new URLSearchParams();
  pipeParams.set('id', producerCalcId);
  pipeParams.set('_pipe', `${currentParams.get('id')}:${targetFieldName}`);
  pipeParams.set('_pipeReturn', returnQuery);

  const a = document.createElement('a');
  a.className = 'pipe-link';
  a.href = `calc.html?${pipeParams.toString()}`;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = label;
  return a;
}

// Button shown on the PRODUCER calc (once `_pipe` is present) that sends
// `value` back to the consumer calc's field and returns the browser there.
export function buildSendBackButton(pipeRequest, valueLabel, getValue) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-hero-primary pipe-send-btn';
  btn.textContent = `Send ${valueLabel} back →`;
  btn.addEventListener('click', () => {
    const returnParams = new URLSearchParams(pipeRequest.pipeReturn);
    returnParams.set('id', pipeRequest.consumerCalcId);
    returnParams.set(pipeRequest.targetFieldName, String(getValue()));
    returnParams.set('_piped', pipeRequest.targetFieldName);
    window.location.href = `calc.html?${returnParams.toString()}`;
  });
  return btn;
}
