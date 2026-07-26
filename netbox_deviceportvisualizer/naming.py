import re

# Longest-prefix-first so e.g. "TenGigabitEthernet" matches before "GigabitEthernet" would ever get a
# chance to (it wouldn't here, but this ordering rule is what keeps the table safe to extend).
_PREFIX_ABBREVIATIONS = (
    ('HundredGigabitEthernet', 'Hu'),
    ('FortyGigabitEthernet', 'Fo'),
    ('TwentyFiveGigabitEthernet', 'Twe'),
    ('TenGigabitEthernet', 'Te'),
    ('TwoGigabitEthernet', 'Tw'),
    ('GigabitEthernet', 'Gi'),
    ('FastEthernet', 'Fa'),
    ('Ethernet', 'Eth'),
    ('Port-channel', 'Po'),
    ('Loopback', 'Lo'),
    ('Serial', 'Se'),
    ('Vlan', 'Vl'),
    ('Console', 'Con'),
)


def shorten_component_name(name):
    """
    Abbreviate a component's full name for compact display on the diagram, e.g.
    "GigabitEthernet1/0/1" -> "Gi1/0/1". Falls back to the original name for anything unrecognized
    (e.g. vendor-specific naming, or already-short names) - the full name is always retained separately
    for matching/highlighting, so a missed abbreviation never breaks functionality, only cosmetics.
    """
    for prefix, abbreviation in _PREFIX_ABBREVIATIONS:
        if name.startswith(prefix) and re.match(r'^\d', name[len(prefix):]):
            return abbreviation + name[len(prefix):]
    return name
