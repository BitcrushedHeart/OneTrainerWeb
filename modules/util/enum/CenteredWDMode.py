from enum import Enum


class CenteredWDMode(str, Enum):
    full = "full"
    float8 = "float8"
    int8 = "int8"
    int4 = "int4"

    def __str__(self):
        return self.value
