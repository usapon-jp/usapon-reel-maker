import {expect, test} from '@playwright/test';

test('shows the minimal reel creation flow and four built-in moods', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', {name: '素材を入れたら、リール完成。'})).toBeVisible();
  await expect(page.getByText('背景を追加')).toBeVisible();
  await expect(page.getByText('PNGを追加')).toBeVisible();
  for (const name of ['ふんわり', 'ポップ', 'にぎやか', 'エモい']) {
    await expect(page.getByRole('button', {name: new RegExp(name)})).toBeVisible();
  }
  await expect(page.getByRole('button', {name: /リールを作る/})).toBeDisabled();
});

test('opens the data-driven motion template editor', async ({page}) => {
  await page.goto('/templates');
  await expect(page.getByRole('heading', {name: '雰囲気テンプレート'})).toBeVisible();
  await page.getByRole('button', {name: /ふんわり/}).click();
  await expect(page.getByText('初期テンプレートはいつでも復元')).toBeVisible();
  await expect(page.getByRole('button', {name: '選択中を複製'})).toBeEnabled();
});
