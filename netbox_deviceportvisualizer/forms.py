import json

from django import forms
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _


class LayoutImportForm(forms.Form):
    layout_file = forms.FileField(
        label=_('Layout file'),
        help_text=_('A layout JSON file previously downloaded via Export Layout.'),
    )

    def clean_layout_file(self):
        upload = self.cleaned_data['layout_file']
        try:
            payload = json.loads(upload.read().decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValidationError(_('This does not appear to be a valid layout JSON file.'))

        if not isinstance(payload, dict) or 'positions' not in payload:
            raise ValidationError(_('This file is missing the expected "positions" list.'))

        return payload
