from __future__ import annotations

import torch
from torch import nn
from torch.nn import functional as F


class ConvBlock(nn.Module):
    def __init__(self, in_channels: int, out_channels: int) -> None:
        super().__init__()
        self.layers = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.GELU(),
            nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.GELU(),
        )

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        return self.layers(inputs)


class ChangeUNet(nn.Module):
    """U-Net change mask model using before, after, and absolute-difference bands."""

    def __init__(self, input_channels: int, base_channels: int = 32) -> None:
        super().__init__()
        if input_channels < 1 or base_channels < 4:
            raise ValueError("input_channels must be positive and base_channels at least 4")

        self.encoder1 = ConvBlock(input_channels * 3, base_channels)
        self.encoder2 = ConvBlock(base_channels, base_channels * 2)
        self.encoder3 = ConvBlock(base_channels * 2, base_channels * 4)
        self.encoder4 = ConvBlock(base_channels * 4, base_channels * 8)
        self.bottleneck = ConvBlock(base_channels * 8, base_channels * 16)
        self.pool = nn.MaxPool2d(2)
        self.decoder4 = ConvBlock(base_channels * 16 + base_channels * 8, base_channels * 8)
        self.decoder3 = ConvBlock(base_channels * 8 + base_channels * 4, base_channels * 4)
        self.decoder2 = ConvBlock(base_channels * 4 + base_channels * 2, base_channels * 2)
        self.decoder1 = ConvBlock(base_channels * 2 + base_channels, base_channels)
        self.output = nn.Conv2d(base_channels, 1, kernel_size=1)

    @staticmethod
    def _up(inputs: torch.Tensor, reference: torch.Tensor) -> torch.Tensor:
        return F.interpolate(inputs, size=reference.shape[-2:], mode="bilinear", align_corners=False)

    def forward(self, before: torch.Tensor, after: torch.Tensor) -> torch.Tensor:
        if before.shape != after.shape or before.ndim != 4:
            raise ValueError("before and after must have identical [batch, channels, height, width] shapes")
        inputs = torch.cat((before, after, torch.abs(after - before)), dim=1)
        enc1 = self.encoder1(inputs)
        enc2 = self.encoder2(self.pool(enc1))
        enc3 = self.encoder3(self.pool(enc2))
        enc4 = self.encoder4(self.pool(enc3))
        center = self.bottleneck(self.pool(enc4))
        dec4 = self.decoder4(torch.cat((self._up(center, enc4), enc4), dim=1))
        dec3 = self.decoder3(torch.cat((self._up(dec4, enc3), enc3), dim=1))
        dec2 = self.decoder2(torch.cat((self._up(dec3, enc2), enc2), dim=1))
        dec1 = self.decoder1(torch.cat((self._up(dec2, enc1), enc1), dim=1))
        return self.output(dec1)

