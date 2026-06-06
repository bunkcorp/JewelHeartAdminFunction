#!/usr/bin/env python3
"""Patch ~/private-server/src/jewelheart/sduiScreens.js for volunteer search/assign SDUI."""
from pathlib import Path

p = Path.home() / "private-server/src/jewelheart/sduiScreens.js"
s = p.read_text()
old_import = "import { buildJewelheartHomeScreen } from './jewelheart-sdui-home.js';"
new_import = (
    "import { buildJewelheartHomeScreen, buildJewelheartVolunteerSearchScreen, "
    "buildJewelheartVolunteerAssignScreen } from './jewelheart-sdui-home.js';"
)
if old_import in s:
    s = s.replace(old_import, new_import)
home_block = """    case 'jewelheart.home':
    case 'home':
      return wrap(await buildJewelheartHomeScreen(firebaseUid, authToken));"""
insert = home_block + """
    case 'jewelheart.volunteer.search':
      return wrap(
        await buildJewelheartVolunteerSearchScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.volunteer.assign':
      return wrap(
        await buildJewelheartVolunteerAssignScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );"""
if "jewelheart.volunteer.search" not in s and home_block in s:
    s = s.replace(home_block, insert)
p.write_text(s)
print("patched", p)
