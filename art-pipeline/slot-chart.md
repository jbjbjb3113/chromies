Chromies Master Slot Chart
Palette Slots (16 total, indexed 0-15)
SlotRoleSIGNAL HexPurpose0background#e3e5e4Canvas background (Normies-matching off-white)1mask_dark#1a0d0eDarkest of mask family; outlines, frames, dark detail2mask_mid#2a1518Mid mask tone; fold shadows, beard depth3highlight#f0eae0Universal bright accent; catchlights, eye glints, rim lights4skin_shadow_deep#4c270fDeepest skin shadow (jaw, neck)5skin_shadow#89532aSkin shadow tone6skin_mid#b2723fMid skin tone7skin_light#d18b4dLit skin tone8skin_highlight#df9c5eBrightest skin tone9hood#1c1c26Primary hood/garment color10eye_socket#1a0a14Eye socket / deepest eye dark11eye_glow#a01856Mid-tone eye accent12eye_signal#ff2d8aBright magenta signal accent13hair_dark#4d051bDarkest hair14hair_mid#9b2352Mid hair15hair_bright#db5a91Brightest hair

Component Slot Usage (which slots each component can draw with)
ComponentzOrderSlots UsedHex Codeshood51, 2, 3, 9#1a0d0e, #2a1518, #f0eae0, #1c1c26neck83, 4, 5, 6, 7, 8All skin tones + highlighthead103, 4, 5, 6, 7, 8All skin tones + highlighttattoo151, 3, 12#1a0d0e, #f0eae0, #ff2d8amask201, 2, 3#1a0d0e, #2a1518, #f0eae0beard251, 2, 3#1a0d0e, #2a1518, #f0eae0mustache261, 3#1a0d0e, #f0eae0eyes303, 10, 11, 12#f0eae0, #1a0a14, #a01856, #ff2d8aearrings321, 3, 12#1a0d0e, #f0eae0, #ff2d8aglasses351, 3#1a0d0e, #f0eae0hair401, 3, 13, 14, 15#1a0d0e, #f0eae0, #4d051b, #9b2352, #db5a91
zOrder note: lower number = drawn first (further back). Higher = on top.

File Naming Conventions
SlotFormatExampleHeadHEAD_<Character>.pngHEAD_HeroA.pngNeckNECK_<Character>.pngNECK_HeroA.pngEverything else<SLOT>_<Name>.pngHAIR_Mohawk.png, HOOD_Classic.pngEmpty slots<SLOT>_None.png (fully transparent 64×64)HAIR_None.png
Display names are Title Case — they become the metadata trait values directly.

Workflow to Add a New Variant

Pixel in Aseprite: 64×64, transparent background, palette = chromies-signal.gpl
Use only the hex codes listed for that component
Save with the slot-prefixed filename to art-pipeline/components/
Add the variant entry to traits.json under that slot's variants array:

json   { "name": "MyName", "file": "SLOT_MyName.png", "weight": 50 }

Run node gallery.js --count 24 to see it in rotation

Weights are relative. Higher = more common. SIGNAL Mohawk weight 80 vs new variant weight 40 = Mohawk twice as common.

Generation Commands
node generate.js --token 1                    # one specific token
node generate.js --token 1 --skip glasses     # skip a layer
node gallery.js --count 24                    # batch of 24 with grid view
node gallery.js --count 100 --start 50        # tokens 50-149
node build-master.js                          # rebuild master ledger from disk

Output File Locations
output/
??? tokens/
?   ??? 0001.png          (64×64, on-chain)
?   ??? 0001_1024.png     (upscaled for viewing)
?   ??? 0001.svg          (on-chain format)
?   ??? 0001.json         (metadata)
??? master.json           (collection ledger, JSON)
??? master.csv            (collection ledger, spreadsheet)
??? gallery_24_signal_1.png  (grid preview)