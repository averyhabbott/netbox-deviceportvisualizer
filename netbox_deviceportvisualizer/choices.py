from utilities.choices import ChoiceSet


class ComponentFaceChoices(ChoiceSet):
    FACE_FRONT = 'front'
    FACE_REAR = 'rear'

    CHOICES = [
        (FACE_FRONT, 'Front'),
        (FACE_REAR, 'Rear'),
    ]
