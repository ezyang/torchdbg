import torchdbg
import torch

with torchdbg.LoggingMode():
    x = torch.randn(3)
    x = torch.nn.functional.dropout(x, 0.5)
    x = torch.nn.functional.dropout(x, 0.5)
    x = torch.nn.functional.dropout(x, 0.5)
