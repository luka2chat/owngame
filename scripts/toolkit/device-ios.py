"""USB file transport for the owngame container (pymobiledevice3 11.39+).

Only this app's Documents/DevelopmentInbox is read or written. No device-wide
filesystem access, network tunnel, system settings, or game-script bridge.
"""
import asyncio
import json
import os
import re
import sys
from pathlib import Path

BUNDLE = "dev.owngame.app"
INBOX = "/Documents/DevelopmentInbox"
UUID = re.compile(r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$")

async def main(args):
    from pymobiledevice3.lockdown import create_using_usbmux
    from pymobiledevice3.usbmux import list_devices
    from pymobiledevice3.services.house_arrest import HouseArrestService
    if args["operation"] == "list":
        result = []
        for device in await list_devices():
            if not device.is_usb:
                continue
            lockdown = await create_using_usbmux(serial=device.serial, connection_type="USB")
            try:
                result.append({"platform":"ios", "id":device.serial,
                    "name":lockdown.all_values.get("DeviceName", lockdown.product_type), "version":lockdown.product_version})
            finally:
                await lockdown.close()
        return {"devices":result}
    device = args["device"]
    request = args["requestId"]
    if not UUID.fullmatch(request):
        raise ValueError("Invalid development request")
    lockdown = await create_using_usbmux(serial=device, connection_type="USB")
    try:
        remote = INBOX + "/" + request
        async with await HouseArrestService.create(lockdown, BUNDLE, documents_only=True) as files:
            if args["operation"] == "sync":
                # USB directory transfer does not make a package executable. The
                # matching ready marker is written only after the copy completes.
                await files.makedirs(INBOX)
                await files.push(args["bundle"], INBOX, progress_bar=False)
                await files.set_file_contents(remote + "/ready.json", args["ready"].encode())
                if args.get("launch", True):
                    if int(lockdown.product_version.split(".")[0]) >= 17:
                        process = await asyncio.create_subprocess_exec("xcrun", "devicectl", "device", "process", "launch",
                            "--device", device, BUNDLE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                        stdout, stderr = await process.communicate()
                        if process.returncode:
                            raise RuntimeError("Could not launch owngame: " + stderr.decode(errors="replace")[-1500:])
                    else:
                        from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
                        from pymobiledevice3.services.dvt.instruments.process_control import ProcessControl
                        async with DvtProvider(lockdown) as dvt, ProcessControl(dvt) as control:
                            await control.launch(BUNDLE, kill_existing=True)
                deadline = asyncio.get_running_loop().time() + args.get("timeout", 120)
                while asyncio.get_running_loop().time() < deadline:
                    if await files.exists(remote + "/receipt.json"):
                        info = await files.stat(remote + "/receipt.json")
                        if int(info["st_size"]) > 256*1024:
                            raise ValueError("Oversized development receipt")
                        try:
                            receipt = json.loads(await files.get_file_contents(remote + "/receipt.json"))
                        except (json.JSONDecodeError, FileNotFoundError):
                            await asyncio.sleep(.5)
                            continue
                        if receipt.get("requestId") != request:
                            raise ValueError("Mismatched development receipt")
                        if receipt.get("status") in ["running", "failed"]:
                            return receipt
                    await asyncio.sleep(.75)
                raise TimeoutError("No container receipt. Unlock/open owngame and check that it contains the device-development update.")
            if args["operation"] == "receipt":
                info = await files.stat(remote + "/receipt.json")
                if int(info["st_size"]) > 256*1024:
                    raise ValueError("Oversized development receipt")
                return json.loads(await files.get_file_contents(remote + "/receipt.json"))
            raise ValueError("Unknown iOS transport operation")
    finally:
        await lockdown.close()

if __name__ == "__main__":
    try:
        result = asyncio.run(main(json.load(sys.stdin)))
        print(json.dumps(result, ensure_ascii=False))
    except ModuleNotFoundError as error:
        print(json.dumps({"error":"Install pymobiledevice3 in a Python environment and set OWNGAME_IOS_PYTHON to its Python executable: " + str(error)}))
        sys.exit(1)
    except Exception as error:
        print(json.dumps({"error":type(error).__name__ + ": " + str(error)}))
        sys.exit(1)
