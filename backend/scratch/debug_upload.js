const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 }
  });
  const page = await context.newPage();

  // Intercept all network responses
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/dokumen') || url.includes('/file') || url.includes('/upload')) {
      console.log(`\n[API UPLOAD TRIGGERED] URL: ${url}`);
      console.log(`Status: ${response.status()} ${response.statusText()}`);
      try {
        const body = await response.text();
        console.log(`Response Body: ${body}`);
      } catch (e) {
        console.log(`Failed to read response body: ${e.message}`);
      }
    }
  });

  try {
    console.log('Navigating to login URL...');
    await page.goto('https://ui-login-stg.oss.go.id');
    await page.waitForLoadState('networkidle');

    console.log('Filling credentials...');
    await page.locator('input[name="username"]').fill('nibtest_935251@yopmail.com');
    await page.locator('input[type="password"]').fill('SecretPassword123!');
    
    // Wait for manual CAPTCHA bypass if needed, but staging CAPTCHA is usually static or mockable
    // Let's click sign in
    console.log('Clicking sign in...');
    await page.click('button:has-text("Masuk"), button[type="submit"]');
    
    console.log('Waiting for redirection...');
    await page.waitForTimeout(10000);

    // If still on login page, let's wait a bit longer for redirect
    if (page.url().includes('login')) {
      console.log('Still on login page. Waiting another 10s for login completion...');
      await page.waitForTimeout(10000);
    }

    console.log(`Current URL: ${page.url()}`);

    // Navigate to locations page
    console.log('Navigating to kelola-usaha...');
    await page.goto('https://ui-perizinan-stg.oss.go.id/kelola-usaha');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // Close dialog if visible
    const mengertiBtn = page.getByRole('button', { name: 'Mengerti' });
    if (await mengertiBtn.isVisible()) {
      await mengertiBtn.click();
      await page.waitForTimeout(1000);
    }

    console.log('Clicking Tambah Lokasi...');
    await page.getByRole('button', { name: 'Tambah Lokasi' }).click();
    await page.waitForTimeout(3000);

    console.log('Clicking Tambah Posisi Lokasi...');
    await page.getByRole('button', { name: 'Tambah Posisi Lokasi' }).click();
    await page.waitForTimeout(3000);

    console.log('Selecting Darat...');
    await page.getByRole('radio', { name: 'Darat' }).check();
    await page.getByRole('radio', { name: 'Individual' }).check();
    await page.getByRole('checkbox', { name: 'Permohonan persyaratan dasar' }).check();

    console.log('Filling coordinates...');
    await page.getByRole('combobox', { name: 'Cari alamat...' }).fill('-7.562258, 110.802438');
    await page.waitForTimeout(3000);
    await page.getByRole('listbox').getByRole('option').locator('div').first().click();
    await page.waitForTimeout(1000);

    console.log('Filling Alamat & Luas Lahan...');
    await page.getByRole('textbox', { name: 'Luas Lahan' }).fill('150');
    await page.getByRole('textbox', { name: 'Alamat lengkap' }).fill('Jl. Staging Test No. 10');

    // Provinsi Combobox
    console.log('Selecting Provinsi...');
    const provSelect = page.getByRole('combobox', { name: 'Pilih provinsi' });
    await provSelect.click();
    await provSelect.fill('DKI JAKARTA');
    await page.waitForTimeout(2000);
    await page.locator('.v-list-item >> text=DKI JAKARTA').first().click();
    await page.waitForTimeout(1000);

    // Kota Combobox
    console.log('Selecting Kota...');
    const kotaSelect = page.getByPlaceholder('Kabupaten').locator('input');
    await kotaSelect.click();
    await kotaSelect.fill('JAKARTA SELATAN');
    await page.waitForTimeout(2000);
    await page.locator('.v-list-item >> text=KOTA ADM. JAKARTA SELATAN').first().click();
    await page.waitForTimeout(1000);

    // Kecamatan Combobox
    console.log('Selecting Kecamatan...');
    const kecSelect = page.getByPlaceholder('Kecamatan').locator('input');
    await kecSelect.click();
    await kecSelect.fill('CILANDAK');
    await page.waitForTimeout(2000);
    await page.locator('.v-list-item >> text=CILANDAK').first().click();
    await page.waitForTimeout(1000);

    // Kelurahan Combobox
    console.log('Selecting Kelurahan...');
    const kelSelect = page.getByPlaceholder('Kelurahan').locator('input');
    await kelSelect.click();
    await kelSelect.fill('CILANDAK BARAT');
    await page.waitForTimeout(2000);
    await page.locator('.v-list-item >> text=CILANDAK BARAT').first().click();
    await page.waitForTimeout(1000);

    // Kode Pos
    await page.getByRole('textbox', { name: 'Kode Pos' }).fill('12430');

    // Generate two dummy PDFs for test
    console.log('Generating dummy files...');
    const file1 = path.join(__dirname, 'test1.pdf');
    const file2 = path.join(__dirname, 'test2.pdf');
    fs.writeFileSync(file1, 'dummy PDF content 1');
    fs.writeFileSync(file2, 'dummy PDF content 2');

    console.log('Uploading file 1...');
    const fileInputs = page.locator('input[type="file"]');
    await fileInputs.nth(0).setInputFiles(file1);
    await page.waitForTimeout(5000);

    console.log('Uploading file 2...');
    await fileInputs.nth(1).setInputFiles(file2);
    await page.waitForTimeout(5000);

    console.log('Clicking Simpan Posisi Lokasi...');
    await page.getByRole('button', { name: 'Simpan Posisi Lokasi' }).click();
    await page.waitForTimeout(5000);

    await page.screenshot({ path: path.join(__dirname, 'debug_final_state.png') });
    console.log('Done!');
  } catch (e) {
    console.error(`Script error: ${e.stack}`);
  } finally {
    await browser.close();
  }
}

run();
