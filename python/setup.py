# Shim so wheels that carry the single-executable engine get a platform tag.
import os
from setuptools import setup
from setuptools.dist import Distribution


class MaybeBinary(Distribution):
    def has_ext_modules(self):
        return os.path.isdir(os.path.join(os.path.dirname(__file__), "stitap", "_bin"))


setup(distclass=MaybeBinary)
