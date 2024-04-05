import torchdbg
import torch

with torchdbg.LoggingMode():
    torch.nn.functional.dropout(torch.randn(3), 0.5)
