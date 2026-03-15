const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
const output = path.join(__dirname, '..', 'TiltedBot-Commands.pdf');
doc.pipe(fs.createWriteStream(output));

const red = '#ff4444';
const dark = '#1a1a1a';
const gray = '#666666';
const lightGray = '#e0e0e0';

// Title
doc.fontSize(28).fillColor(red).text('TiltedBot', { align: 'center' });
doc.fontSize(12).fillColor(gray).text('Command Reference', { align: 'center' });
doc.moveDown(1.5);

// Divider helper
function divider() {
  doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor(lightGray).stroke();
  doc.moveDown(0.75);
}

// Section helper
function section(title) {
  doc.moveDown(0.5);
  doc.fontSize(16).fillColor(red).text(title);
  doc.moveDown(0.3);
  divider();
}

// Command helper
function command(name, description) {
  doc.fontSize(11).fillColor(dark).text(name, { continued: false });
  doc.fontSize(10).fillColor(gray).text(description);
  doc.moveDown(0.5);
}

// --- Member Commands ---
section('Member Commands');
command('/roles', 'Open the full role selection menu (tilt tier, genres, platforms). Updates roles on submit.');
command('/tilt', 'Quick-change your Tilt Tier without opening the full menu.');
command('/genres', 'Update your genre roles only.');
command('/platforms', 'Update your platform roles only.');
command('/setup', 'Manually trigger the onboarding flow if you missed it or the bot was offline when you joined.');

// --- Admin Commands ---
section('Admin Commands  (Damage Control only)');
command('/admin genre add [name]', 'Create a new genre role and add it to the onboarding menu. Creates the Discord role automatically.');
command('/admin genre remove [name]', 'Remove a genre role from the bot. Warns if members currently have it.');
command('/admin platform add [name]', 'Add a new platform role.');
command('/admin platform remove [name]', 'Remove a platform role.');
command('/admin tilt add [name]', 'Add a new tilt tier role.');
command('/admin tilt remove [name]', 'Remove a tilt tier role.');
command('/admin roster', 'Show a breakdown of the server by tilt tiers, genres, platforms, and unroled members.');
command('/admin kick-unroled [days]', 'List members who haven\'t completed onboarding after X days (default: 7). Does not auto-kick.');
command('/admin setchannel [type] [channel]', 'Set the onboarding, welcome, or log channel.\nTypes: onboarding, welcome, log');

// --- How Onboarding Works ---
section('How Onboarding Works');
doc.fontSize(10).fillColor(dark);
doc.text('1.  New member joins the server.', { indent: 10 });
doc.text('2.  Bot posts a welcome message with a "Get Started" button in the onboarding channel.', { indent: 10 });
doc.text('3.  Member clicks the button and picks their Tilt Tier, Genres, and Platforms (only they can see this).', { indent: 10 });
doc.text('4.  Member hits Confirm. Bot assigns General + selected roles.', { indent: 10 });
doc.text('5.  Welcome message is posted in the welcome channel. Onboarding message is deleted.', { indent: 10 });
doc.text('6.  Member can now see all public channels.', { indent: 10 });
doc.moveDown(1);

// --- Protected Roles ---
section('Protected Roles (bot will never touch)');
doc.fontSize(10).fillColor(dark);
const protectedRoles = [
  ['Shimmy (baby angel emoji)', 'Memorial role. Sacred — never modified.'],
  ['Damage Control', 'Admin role. Manually assigned by server owner.'],
  ['Zell', 'Special role for Itzell. Manually assigned.'],
  ['Server Booster', 'Discord system role.'],
  ['Jockie Music', 'External bot role.'],
];
for (const [role, desc] of protectedRoles) {
  doc.fontSize(10).fillColor(dark).text(role, { continued: true });
  doc.fillColor(gray).text(`  —  ${desc}`);
}
doc.moveDown(1.5);

// Footer
divider();
doc.fontSize(9).fillColor(gray).text('TiltedBot  |  Generated for Damage Control team', { align: 'center' });

doc.end();
console.log(`PDF saved to: ${output}`);
