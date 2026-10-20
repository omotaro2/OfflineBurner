import assert from "node:assert/strict"
import test from "node:test"
import {
  explainWriteError,
  isBlockDevice,
  isCardMount,
  isLauncherSd,
  selectLauncherVolumes,
  type BlockIdentity,
  type LsblkNode,
} from "./sd-volume.ts"

const launcher: BlockIdentity = {
  vendor: "M5Stack",
  model: "Launcher SD",
  idVendor: "303a",
  idProduct: "1001",
  usbProduct: "Launcher SD",
  usbManufacturer: "M5Stack",
}

test("recognizes Launcher USB mass storage", () => {
  assert.equal(isLauncherSd(launcher), true)
  assert.equal(
    isLauncherSd({ ...launcher, vendor: "", model: "", usbProduct: "Launcher SD", usbManufacturer: "", idVendor: "303a" }),
    true,
  )
  assert.equal(
    isLauncherSd({ ...launcher, vendor: "SanDisk", model: "Ultra", usbProduct: "Ultra", usbManufacturer: "SanDisk", idVendor: "0781" }),
    false,
  )
  assert.equal(isBlockDevice("/dev/sdb1"), true)
  assert.equal(isBlockDevice("/dev/mmcblk0p1"), true)
  assert.equal(isBlockDevice("/tmp/card"), false)
  assert.equal(isCardMount("/media/field/CARD"), true)
  assert.equal(isCardMount("/run/media/field/CARD"), true)
  assert.equal(isCardMount("/"), false)
  assert.equal(isCardMount("/tmp/card"), false)
})

test("selects the FAT volume on a Launcher disk", () => {
  const devices: LsblkNode[] = [
    {
      name: "sda",
      type: "disk",
      children: [
        { name: "sda1", path: "/dev/sda1", type: "part", fstype: "ext4", label: "root", mountpoint: "/" },
      ],
    },
    {
      name: "sdb",
      type: "disk",
      vendor: "M5Stack",
      model: "Launcher SD",
      children: [
        {
          name: "sdb1",
          path: "/dev/sdb1",
          type: "part",
          fstype: "vfat",
          label: "NO NAME",
          mountpoint: "/media/field/NO NAME",
          ro: "0",
        },
      ],
    },
  ]
  const selected = selectLauncherVolumes(devices, { sdb: launcher })
  assert.equal(selected.length, 1)
  assert.equal(selected[0]?.device, "/dev/sdb1")
  assert.equal(selected[0]?.mount, "/media/field/NO NAME")
  assert.equal(selected[0]?.readOnly, false)
  assert.equal(selected[0]?.label, "NO NAME")
})

test("keeps an unmounted Launcher partition so the app can open it", () => {
  const selected = selectLauncherVolumes(
    [
      {
        name: "sdc",
        type: "disk",
        children: [{ name: "sdc1", path: "/dev/sdc1", type: "part", fstype: "vfat", mountpoint: null, ro: false }],
      },
    ],
    { sdc: launcher },
  )
  assert.equal(selected[0]?.mount, null)
  assert.equal(selected[0]?.device, "/dev/sdc1")
})

test("explains permission and disconnect errors", () => {
  const denied = new Error("EACCES") as NodeJS.ErrnoException
  denied.code = "EACCES"
  assert.match(explainWriteError(denied).message, /権限/)
  const gone = new Error("ENODEV") as NodeJS.ErrnoException
  gone.code = "ENODEV"
  assert.match(explainWriteError(gone).message, /USB/)
  assert.equal(explainWriteError(new Error("すでに説明した")).message, "すでに説明した")
})
