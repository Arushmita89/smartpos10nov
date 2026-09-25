from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.style import WD_STYLE_TYPE
import datetime

doc = Document()

# ── Styles ──────────────────────────────────────────────
style = doc.styles['Normal']
font = style.font
font.name = 'Calibri'
font.size = Pt(11)

for level in range(1, 4):
    heading_style = doc.styles[f'Heading {level}']
    heading_style.font.color.rgb = RGBColor(0x1A, 0x1A, 0x2E)

# ═══════════════════════════════════════════════════════════
#  PART 1 — COMPLETE VIDEO SCRIPT
# ═══════════════════════════════════════════════════════════

doc.add_heading('SmartPOS — Complete Video Script', level=0)

p = doc.add_paragraph()
run = p.add_run(f'Generated: {datetime.date.today().strftime("%B %d, %Y")}')
run.font.size = Pt(9)
run.font.color.rgb = RGBColor(0x88, 0x88, 0x88)

doc.add_paragraph()

# ── Helper ──────────────────────────────────────────────
def add_scene(doc, scene_num, title, duration, visual, voiceover, notes=None):
    doc.add_heading(f'Scene {scene_num}: {title}', level=2)
    tbl = doc.add_table(rows=4 if notes else 3, cols=2, style='Light Shading Accent 1')
    tbl.columns[0].width = Inches(1.5)
    tbl.columns[1].width = Inches(5.0)
    labels = ['Duration', 'Visual', 'Voiceover', 'Notes']
    values = [duration, visual, voiceover, notes] if notes else [duration, visual, voiceover]
    for i, (label, value) in enumerate(zip(labels, values)):
        tbl.rows[i].cells[0].text = label
        tbl.rows[i].cells[1].text = value
        for cell in tbl.rows[i].cells:
            for paragraph in cell.paragraphs:
                paragraph.style.font.size = Pt(10)
    doc.add_paragraph()

# ── INTRO ───────────────────────────────────────────────
doc.add_heading('Video Overview', level=1)
doc.add_paragraph(
    'This script covers a full product walkthrough of SmartPOS — a modern, '
    'cloud-based point-of-sale system built for restaurants and retail businesses. '
    'The video is structured into 12 scenes with an estimated total runtime of '
    '8–10 minutes.'
)

doc.add_heading('Target Audience', level=2)
doc.add_paragraph('Restaurant owners, managers, and staff looking for an affordable, easy-to-use POS solution.')

doc.add_heading('Tone & Style', level=2)
doc.add_paragraph('Professional, friendly, and energetic. Screen recordings with voiceover narration. Light background music.')

doc.add_page_break()

# ═══════════════════════════════════════════════════════════
#  SCENES
# ═══════════════════════════════════════════════════════════

doc.add_heading('Script', level=1)

add_scene(doc, 1, 'Opening / Hook', '0:00 – 0:30',
    visual='Animated SmartPOS logo reveal → montage of busy restaurant scenes → SmartPOS dashboard appearing on a laptop and phone.',
    voiceover=(
        'Running a restaurant is hard enough — managing orders, tracking inventory, '
        'and handling payments shouldn\'t make it harder.\n\n'
        'Introducing SmartPOS — the all-in-one point-of-sale system designed to '
        'streamline your restaurant operations, boost efficiency, and give you '
        'real-time control over your business.\n\n'
        'Let us show you how it works.'
    ),
    notes='Background music: upbeat, modern instrumental. Fade in from black.'
)

add_scene(doc, 2, 'Login & Signup', '0:30 – 1:15',
    visual='Screen recording: SmartPOS login page → click "Sign Up" → fill in name, email, password, restaurant name → click Create Account → land on dashboard.',
    voiceover=(
        'Getting started with SmartPOS takes less than a minute.\n\n'
        'Head to the SmartPOS website and click Sign Up. Enter your name, email, '
        'password, and your restaurant name. That\'s it — you\'re in.\n\n'
        'Every new account comes with a 30-day free trial, no credit card required. '
        'You\'ll have full access to every feature so you can see exactly how '
        'SmartPOS fits your business.'
    ),
    notes='Show the clean, minimal auth UI. Highlight "30-day free trial" badge.'
)

add_scene(doc, 3, 'Customer Mode — Browse & Order', '1:15 – 2:30',
    visual='Screen recording: Customer Mode interface → browse menu categories → tap an item → customization modal (size, toppings, remarks) → Add to Cart → cart review → checkout.',
    voiceover=(
        'SmartPOS has a dedicated Customer Mode that turns any tablet or screen '
        'into a self-service ordering kiosk.\n\n'
        'Customers can browse the full menu, filter by category, and search for '
        'their favourite dishes. When they pick an item, they can customize it — '
        'choose a size, add toppings, and even type in special instructions.\n\n'
        'Everything gets added to the cart, where they can review their order, '
        'make changes, and proceed to checkout. It\'s intuitive, fast, and '
        'requires zero staff involvement.'
    ),
    notes='Show category tabs: Starters, Main Course, Breads, Rice, Beverages, Desserts. Show item customization with price updates.'
)

add_scene(doc, 4, 'Customer Mode — Payment & Receipt', '2:30 – 3:30',
    visual='Screen recording: Cart checkout → payment screen (Razorpay / Cash) → Razorpay modal with UPI, Card, NetBanking options → payment success → receipt preview → print/email/WhatsApp receipt.',
    voiceover=(
        'When the customer is ready to pay, SmartPOS supports multiple payment '
        'methods — Razorpay for UPI, credit and debit cards, and net banking, '
        'as well as cash payments.\n\n'
        'For online payments, the Razorpay secure checkout modal opens right inside '
        'the app. The customer picks their preferred method, completes the payment, '
        'and gets instant confirmation.\n\n'
        'After payment, a digital receipt is generated automatically. You can print '
        'it, email it directly to the customer, or share it on WhatsApp — all in '
        'one click.'
    ),
    notes='Emphasize security: "Powered by Razorpay — PCI compliant, bank-grade encryption."'
)

add_scene(doc, 5, 'POS Mode — Quick Billing', '3:30 – 4:30',
    visual='Screen recording: Staff logs in → selects Attendant role → POS screen with menu grid → tap items to add → quantity adjuster → Apply Tax → Proceed to Payment → settle.',
    voiceover=(
        'For front-of-house staff, the POS Mode is built for speed.\n\n'
        'After logging in, staff select their role — Attendant. The POS screen '
        'shows the full menu in a clean grid layout. Just tap items to add them '
        'to the bill, adjust quantities with a single click, and the total updates '
        'in real time.\n\n'
        'When the customer is ready, hit Proceed to Payment, choose cash or online, '
        'and settle the bill in seconds. It\'s designed for high-volume, '
        'rush-hour environments where every second counts.'
    ),
    notes='Show the speed of tapping items. Highlight real-time total calculation.'
)

add_scene(doc, 6, 'Order Management', '4:30 – 5:30',
    visual='Screen recording: Orders dashboard → active orders list → click on an order → status update (Pending → Preparing → Ready → Served) → Order Status screen.',
    voiceover=(
        'SmartPOS gives you complete visibility into every order.\n\n'
        'The Orders dashboard shows all active orders in real time. Staff can '
        'update the status — from Pending, to Preparing, to Ready, and finally '
        'Served — with a single tap.\n\n'
        'Each order shows the items, quantities, table or tab number, and the '
        'estimated delivery time. This means your kitchen, front-of-house, and '
        'management are always on the same page.'
    ),
    notes='Show order card with color-coded status badges. Mention table_number and tab_number features.'
)

add_scene(doc, 7, 'Kitchen Display', '5:30 – 6:15',
    visual='Screen recording: Kitchen staff logs in → Kitchen role → Kitchen Display shows incoming orders → mark items as prepared → order disappears when complete.',
    voiceover=(
        'SmartPOS includes a dedicated Kitchen Display that replaces traditional '
        'paper tickets.\n\n'
        'Kitchen staff log in and see only the orders assigned to them. Each order '
        'shows the items, customizations, and any special remarks from the customer.\n\n'
        'As items are prepared, the kitchen staff marks them complete — and the '
        'status updates live across the entire system. No more shouting across the '
        'room, no more lost tickets.'
    ),
    notes='Show KOT-style order cards with item names, quantities, and customization remarks.'
)

add_scene(doc, 8, 'Menu Management', '6:15 – 7:00',
    visual='Screen recording: Admin dashboard → Menu Management → 24 auto-seeded categories → add new item → upload image → set price → set category → save.',
    voiceover=(
        'Managing your menu is effortless.\n\n'
        'SmartPOS comes pre-loaded with 24 restaurant categories — from Starters '
        'and Main Course to Beverages and Desserts. You can add, edit, or remove '
        'items anytime.\n\n'
        'For each item, you can upload a photo, set the price, assign it to a '
        'category, and define customization options. Changes go live instantly '
        'across all devices — POS, Customer Mode, and Kitchen Display.'
    ),
    notes='Show image upload to Supabase Storage bucket "menu-images". Highlight instant sync across devices.'
)

add_scene(doc, 9, 'Inventory & Ingredients', '7:00 – 7:45',
    visual='Screen recording: Inventory tab → ingredient list → add ingredient → set stock quantity → link ingredient to menu item via recipe → stock movement log.',
    voiceover=(
        'Keep track of your stock with the built-in Inventory module.\n\n'
        'Add ingredients, set initial stock levels, and link them to menu items '
        'through recipes. When an order is placed, SmartPOS automatically deducts '
        'the ingredients used.\n\n'
        'The stock movement log tracks every addition and deduction, so you always '
        'know what\'s in stock and when it\'s time to reorder.'
    ),
    notes='Show the ingredients table, stock_movements table, and recipe linking.'
)

add_scene(doc, 10, 'Reports & Analytics', '7:45 – 8:30',
    visual='Screen recording: Reports tab → Sales overview chart (Recharts) → filter by date range → export options (CSV, Excel, PDF) → download file.',
    voiceover=(
        'Knowledge is power — and SmartPOS gives you deep insights into your business.\n\n'
        'The Reports dashboard shows your sales data in clean, interactive charts. '
        'Filter by date range to see daily, weekly, or monthly performance.\n\n'
        'Need to share data with your accountant? Export your reports as CSV, Excel, '
        'or PDF with one click. It\'s everything you need to make data-driven '
        'decisions.'
    ),
    notes='Show Recharts bar/line charts. Highlight PDF export with company branding.'
)

add_scene(doc, 11, 'Settings & User Management', '8:30 – 9:15',
    visual='Screen recording: Settings page → business info, tax config, receipt template → User Management → add new user → assign role (Admin / Kitchen / Attendant) → PIN login.',
    voiceover=(
        'Customize SmartPOS to match your business.\n\n'
        'In Settings, you can update your business information, configure tax '
        'rates, and customize your receipt template.\n\n'
        'Need to add staff members? Go to User Management, create a new user, '
        'and assign them a role — Admin, Kitchen, or Attendant. Each role sees '
        'only the screens relevant to their job. Kitchen staff see the Kitchen '
        'Display, Attendants see the POS, and Admins see everything.\n\n'
        'For the restaurant dashboard, a simple 4-digit MPIN keeps things secure.'
    ),
    notes='Show the role-based access control. Demonstrate MPIN gate for restaurant mode.'
)

add_scene(doc, 12, 'Closing / Call to Action', '9:15 – 9:45',
    visual='Montage: fast-paced clips of all features shown → SmartPOS logo → pricing plans → website URL → "Start your free trial" button.',
    voiceover=(
        'SmartPOS — the smarter way to run your restaurant.\n\n'
        'Start your free 30-day trial today at smartpos.dev. No credit card '
        'required. Full access to every feature.\n\n'
        'SmartPOS — order smart, serve faster.'
    ),
    notes='End screen: logo + URL + social media handles. Background music fades out.'
)

doc.add_page_break()

# ── Production Notes ────────────────────────────────────
doc.add_heading('Production Notes', level=1)

doc.add_heading('Estimated Runtime', level=2)
doc.add_paragraph('Total: 8–10 minutes (scenes can be trimmed or expanded as needed).')

doc.add_heading('Tools Needed', level=2)
doc.add_paragraph(
    '• Screen recording: OBS Studio or Camtasia\n'
    '• Video editing: Adobe Premiere Pro, DaVinci Resolve, or CapCut\n'
    '• Voiceover: Professional narrator or AI voice (ElevenLabs, Murf)\n'
    '• Music: Royalty-free upbeat instrumental (Artlist, Epidemic Sound)'
)

doc.add_heading('Brand Assets', level=2)
doc.add_paragraph(
    '• Logo: SmartPOS logo (PNG/SVG)\n'
    '• Colors: Primary #1A1A2E, Accent #4CAF50\n'
    '• Font: Inter or Poppins for on-screen text'
)

doc.add_heading('Screen Recording Checklist', level=2)
doc.add_paragraph(
    '• Prepare sample data: menu items, orders, customers\n'
    '• Use a clean browser profile (no personal bookmarks/history)\n'
    '• Set browser to 1280x720 or 1920x1080\n'
    '• Hide bookmarks bar and extensions\n'
    '• Pre-create a demo account with sample orders'
)

doc.add_page_break()

# ═══════════════════════════════════════════════════════════
#  PART 2 — PLAIN SCRIPT (COPY-PASTE)
# ═══════════════════════════════════════════════════════════

doc.add_heading('SmartPOS — Plain Script (Copy-Paste Ready)', level=0)
doc.add_paragraph(
    'Below is the clean voiceover script without scene directions, tables, or '
    'production notes. Copy and paste directly into your teleprompter or '
    'recording software.'
)
doc.add_paragraph()

plain_scenes = [
    (1, 'Opening / Hook',
     'Running a restaurant is hard enough — managing orders, tracking inventory, '
     'and handling payments shouldn\'t make it harder.\n\n'
     'Introducing SmartPOS — the all-in-one point-of-sale system designed to '
     'streamline your restaurant operations, boost efficiency, and give you '
     'real-time control over your business.\n\n'
     'Let us show you how it works.'),

    (2, 'Login & Signup',
     'Getting started with SmartPOS takes less than a minute.\n\n'
     'Head to the SmartPOS website and click Sign Up. Enter your name, email, '
     'password, and your restaurant name. That\'s it — you\'re in.\n\n'
     'Every new account comes with a 30-day free trial, no credit card required. '
     'You\'ll have full access to every feature so you can see exactly how '
     'SmartPOS fits your business.'),

    (3, 'Customer Mode — Browse & Order',
     'SmartPOS has a dedicated Customer Mode that turns any tablet or screen '
     'into a self-service ordering kiosk.\n\n'
     'Customers can browse the full menu, filter by category, and search for '
     'their favourite dishes. When they pick an item, they can customize it — '
     'choose a size, add toppings, and even type in special instructions.\n\n'
     'Everything gets added to the cart, where they can review their order, '
     'make changes, and proceed to checkout. It\'s intuitive, fast, and '
     'requires zero staff involvement.'),

    (4, 'Customer Mode — Payment & Receipt',
     'When the customer is ready to pay, SmartPOS supports multiple payment '
     'methods — Razorpay for UPI, credit and debit cards, and net banking, '
     'as well as cash payments.\n\n'
     'For online payments, the Razorpay secure checkout modal opens right inside '
     'the app. The customer picks their preferred method, completes the payment, '
     'and gets instant confirmation.\n\n'
     'After payment, a digital receipt is generated automatically. You can print '
     'it, email it directly to the customer, or share it on WhatsApp — all in '
     'one click.'),

    (5, 'POS Mode — Quick Billing',
     'For front-of-house staff, the POS Mode is built for speed.\n\n'
     'After logging in, staff select their role — Attendant. The POS screen '
     'shows the full menu in a clean grid layout. Just tap items to add them '
     'to the bill, adjust quantities with a single click, and the total updates '
     'in real time.\n\n'
     'When the customer is ready, hit Proceed to Payment, choose cash or online, '
     'and settle the bill in seconds. It\'s designed for high-volume, '
     'rush-hour environments where every second counts.'),

    (6, 'Order Management',
     'SmartPOS gives you complete visibility into every order.\n\n'
     'The Orders dashboard shows all active orders in real time. Staff can '
     'update the status — from Pending, to Preparing, to Ready, and finally '
     'Served — with a single tap.\n\n'
     'Each order shows the items, quantities, table or tab number, and the '
     'estimated delivery time. This means your kitchen, front-of-house, and '
     'management are always on the same page.'),

    (7, 'Kitchen Display',
     'SmartPOS includes a dedicated Kitchen Display that replaces traditional '
     'paper tickets.\n\n'
     'Kitchen staff log in and see only the orders assigned to them. Each order '
     'shows the items, customizations, and any special remarks from the customer.\n\n'
     'As items are prepared, the kitchen staff marks them complete — and the '
     'status updates live across the entire system. No more shouting across the '
     'room, no more lost tickets.'),

    (8, 'Menu Management',
     'Managing your menu is effortless.\n\n'
     'SmartPOS comes pre-loaded with 24 restaurant categories — from Starters '
     'and Main Course to Beverages and Desserts. You can add, edit, or remove '
     'items anytime.\n\n'
     'For each item, you can upload a photo, set the price, assign it to a '
     'category, and define customization options. Changes go live instantly '
     'across all devices — POS, Customer Mode, and Kitchen Display.'),

    (9, 'Inventory & Ingredients',
     'Keep track of your stock with the built-in Inventory module.\n\n'
     'Add ingredients, set initial stock levels, and link them to menu items '
     'through recipes. When an order is placed, SmartPOS automatically deducts '
     'the ingredients used.\n\n'
     'The stock movement log tracks every addition and deduction, so you always '
     'know what\'s in stock and when it\'s time to reorder.'),

    (10, 'Reports & Analytics',
     'Knowledge is power — and SmartPOS gives you deep insights into your business.\n\n'
     'The Reports dashboard shows your sales data in clean, interactive charts. '
     'Filter by date range to see daily, weekly, or monthly performance.\n\n'
     'Need to share data with your accountant? Export your reports as CSV, Excel, '
     'or PDF with one click. It\'s everything you need to make data-driven '
     'decisions.'),

    (11, 'Settings & User Management',
     'Customize SmartPOS to match your business.\n\n'
     'In Settings, you can update your business information, configure tax '
     'rates, and customize your receipt template.\n\n'
     'Need to add staff members? Go to User Management, create a new user, '
     'and assign them a role — Admin, Kitchen, or Attendant. Each role sees '
     'only the screens relevant to their job. Kitchen staff see the Kitchen '
     'Display, Attendants see the POS, and Admins see everything.\n\n'
     'For the restaurant dashboard, a simple 4-digit MPIN keeps things secure.'),

    (12, 'Closing / Call to Action',
     'SmartPOS — the smarter way to run your restaurant.\n\n'
     'Start your free 30-day trial today. No credit card required. '
     'Full access to every feature.\n\n'
     'SmartPOS — order smart, serve faster.'),
]

for num, title, script in plain_scenes:
    doc.add_heading(f'Scene {num}: {title}', level=2)
    doc.add_paragraph(script)

# ── Save ────────────────────────────────────────────────
output_path = r'C:\Users\arush\Downloads\smartpos-main\SmartPOS_Video_Script.docx'
doc.save(output_path)
print(f'Saved to {output_path}')
