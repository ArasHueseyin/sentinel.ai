import { afterEach, describe, expect, it } from '@jest/globals';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sentinel } from '../../index.js';
import type { LLMProvider } from '../../utils/llm-provider.js';

// Exercise parsing, execution and verification in Chromium without a network
// service or model. Only the planner's choice is scripted; DOM outcomes are real.
describe('Browser action regressions', () => {
  let sentinel: Sentinel | undefined;
  let verificationCalls: number;

  async function open(html: string, targetName: string, action: string, value?: string) {
    verificationCalls = 0;
    const provider: LLMProvider = {
      async generateStructuredData<T>(prompt: string): Promise<T> {
        expect(prompt).not.toContain('frame-secret');
        if (!prompt.includes('Elements on page (id | role | name | region):')) {
          verificationCalls++;
          return { success: false, confidence: 1, explanation: 'No observable completion' } as T;
        }
        const line = prompt.split('\n').find(line => line.split(' | ')[2] === targetName);
        if (!line) throw new Error(`Missing parsed target: ${targetName}`);
        return {
          candidates: [{ elementId: Number(line.split(' | ')[0]) }],
          action,
          value,
          reasoning: 'Scripted regression action',
        } as T;
      },
      async generateText() {
        return '';
      },
    };
    sentinel = new Sentinel({
      provider,
      headless: true,
      verbose: 0,
      patternCache: false,
      locatorCache: false,
      domSettleTimeoutMs: 500,
    });
    await sentinel.init();
    await sentinel.goto(
      `data:text/html;charset=utf-8,${encodeURIComponent(`<html lang="en"><body>${html}</body></html>`)}`
    );
    return sentinel;
  }

  afterEach(async () => {
    await sentinel?.close();
  });

  it('fills a labelled iframe input using its semantic role and verifies its value', async () => {
    const inner =
      '<label for="card">Card number</label><input id="card"><a href="#paid">Receipt</a><label for="password">Password</label><input id="password" type="password">';
    const s = await open(
      `<iframe style="width:500px;height:200px" srcdoc='${inner}'></iframe>`,
      '[frame] Card number',
      'fill',
      '4242 4242'
    );
    await s.page.frames()[1]!.getByLabel('Password').fill('frame-secret');
    const result = await s.act('Fill the Card number field with 4242 4242', { retries: 0 });
    expect(await s.page.frames()[1]!.getByLabel('Card number').inputValue()).toBe('4242 4242');
    expect(result.success).toBe(true);
    expect(verificationCalls).toBe(0);
  }, 20_000);

  it('verifies a writable wrapped date without repeating the fill', async () => {
    const s = await open(
      '<label for="date">Appointment date</label><div class="MuiDatePicker-root" style="padding:10px;width:260px"><input id="date" placeholder="MM/DD/YYYY"></div>',
      'Appointment date',
      'fill',
      '10/15/2026'
    );
    expect((await s.act('Fill Appointment date with 10/15/2026', { retries: 0 })).success).toBe(
      true
    );
    expect(await s.page.getByLabel('Appointment date').inputValue()).toBe('10/15/2026');
    expect(verificationCalls).toBe(0);
  }, 20_000);

  it('verifies the executed field when two textboxes share their accessible name', async () => {
    const s = await open(
      '<label>Outlined<input></label><br><label>Outlined<input></label>',
      'Outlined',
      'fill',
      'hello sentinel'
    );
    const result = await s.act('Fill the first Outlined field with hello sentinel', { retries: 0 });
    expect(result.success).toBe(true);
    expect(result).not.toHaveProperty('targetId');
    expect(await s.page.getByRole('textbox', { name: 'Outlined' }).first().inputValue()).toBe(
      'hello sentinel'
    );
    expect(await s.page.getByRole('textbox', { name: 'Outlined' }).nth(1).inputValue()).toBe('');
    expect(verificationCalls).toBe(0);
  }, 20_000);

  it('keeps the executed DOM identity when scrolling changes duplicate field positions', async () => {
    const s = await open(
      '<div style="height:2000px"></div><label>Outlined<input></label><div style="height:1500px"></div><label>Outlined<input></label>',
      'Outlined',
      'fill',
      'hello sentinel'
    );
    const result = await s.act('Fill the first Outlined field with hello sentinel', { retries: 0 });
    expect(result.success).toBe(true);
    expect(await s.page.getByRole('textbox', { name: 'Outlined' }).first().inputValue()).toBe(
      'hello sentinel'
    );
    expect(await s.page.getByRole('textbox', { name: 'Outlined' }).nth(1).inputValue()).toBe('');
    expect(verificationCalls).toBe(0);
  }, 20_000);

  it('fills a readonly calendar input through the date cascade', async () => {
    const s = await open(
      `<label for="date">Event date</label><input id="date" readonly placeholder="click to pick" onclick="document.querySelector('[role=dialog]').hidden=false">
      <div role="dialog" aria-label="Choose date" hidden>
        <h3 role="heading">September 2026</h3>
        <button aria-label="Next month" onclick="document.querySelector('h3').textContent='October 2026';document.querySelector('[role=gridcell]').setAttribute('aria-label','October 15, 2026')">Next</button>
        <div role="grid">
          <button role="gridcell" aria-label="September 15, 2026" onclick="document.querySelector('input').value=document.querySelector('h3').textContent.startsWith('October')?'2026-10-15':'2026-09-15';this.closest('[role=dialog]').hidden=true">15</button>
        </div>
      </div>`,
      'Event date',
      'fill',
      '2026-10-15'
    );
    expect(await s.act('Fill Event date with 2026-10-15', { retries: 0 })).toMatchObject({
      success: true,
    });
    expect(await s.page.getByLabel('Event date').inputValue()).toBe('2026-10-15');
    expect(verificationCalls).toBe(0);
  }, 20_000);

  it('does not report a date fill complete when the planner only opens the calendar', async () => {
    const s = await open(
      `<label for="date">Event date</label><input id="date" readonly onclick="document.querySelector('[role=dialog]').hidden=false">
      <div role="dialog" hidden>${Array.from({ length: 31 }, (_, i) => `<button>${i + 1}</button>`).join('')}</div>`,
      'Event date',
      'click'
    );
    expect((await s.act('Fill Event date with 2026-10-15', { retries: 0 })).success).toBe(false);
    expect(await s.page.getByLabel('Event date').inputValue()).toBe('');
    expect(verificationCalls).toBe(1);
  }, 20_000);

  it('verifies a tab by its selected state', async () => {
    const s = await open(
      `<div role="tablist" aria-label="Sections">
      <button role="tab" aria-selected="true">Item One</button>
      <button role="tab" aria-selected="false" onclick="this.previousElementSibling.setAttribute('aria-selected','false');this.setAttribute('aria-selected','true')">Item Two</button>
      </div>`,
      'Item Two',
      'click'
    );
    expect((await s.act('Click the Item Two tab', { retries: 0 })).success).toBe(true);
    expect(await s.page.getByRole('tab', { name: 'Item Two' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    expect(verificationCalls).toBe(0);
  }, 20_000);

  it('does not report an intermediate scroll as a completed click', async () => {
    const s = await open('<button>Continue</button>', 'Continue', 'scroll-down');
    expect((await s.act('Click Continue', { retries: 0 })).success).toBe(false);
    expect(verificationCalls).toBe(0);
  }, 20_000);

  it('forwards fillForm cancellation to the agent', async () => {
    const s = await open(
      '<label for="name">Name</label><input id="name">',
      'Name',
      'fill',
      'Alice'
    );
    const controller = new AbortController();
    controller.abort();
    const result = await s.fillForm({ Name: 'Alice' }, { signal: controller.signal });
    expect(result.aborted).toBe(true);
    expect(result.goalAchieved).toBe(false);
    expect(await s.page.getByLabel('Name').inputValue()).toBe('');
    expect(verificationCalls).toBe(0);
  }, 20_000);

  it('verifies a selected file even when another textbox is present', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'sentinel-upload-regression-'));
    const file = join(directory, 'resume.txt');
    writeFileSync(file, 'Example resume');
    try {
      const s = await open(
        '<label>Name<input></label><label>Curriculum Vitae<input type="file"></label>',
        'Curriculum Vitae',
        'upload',
        file
      );
      const result = await s.act('Upload the resume to the Curriculum Vitae field', { retries: 0 });
      expect(result.success).toBe(true);
      expect(
        await s.page
          .getByLabel('Curriculum Vitae')
          .evaluate(input => (input as HTMLInputElement).files?.[0]?.name)
      ).toBe('resume.txt');
      expect(verificationCalls).toBe(0);
    } finally {
      unlinkSync(file);
      rmdirSync(directory);
    }
  }, 20_000);

  it('discovers a clipped rating radio by its visible label alongside a textbox', async () => {
    const s = await open(
      '<label>Name<input></label><label style="display:inline-block;width:60px;height:40px">4 Stars<input type="radio" name="rating" style="position:absolute;width:1px;height:1px;clip:rect(0,0,0,0)"></label>',
      '4 Stars',
      'click'
    );
    expect((await s.act('Set the rating to 4 stars', { retries: 0 })).success).toBe(true);
    expect(await s.page.getByRole('radio', { name: '4 Stars' }).isChecked()).toBe(true);
  }, 20_000);
});
