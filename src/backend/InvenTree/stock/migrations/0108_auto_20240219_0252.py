# Generated by Django 4.2.10 on 2024-02-19 02:52

from django.db import migrations
from django.db.models import F, OuterRef, Subquery, IntegerField


def update_templates(apps, schema_editor):
    """Run data migration to fix potentially mis-applied data migration.
    
    Ref: https://github.com/inventree/InvenTree/pull/6514

    The previous data migration (stock.0106_auto_20240207_0353) had a bug,
    where it would look for any matching PartTestTemplate objects for a given StockItemTestResult,
    as long as the "part tree ID" was the same.

    However, if the template was defined for a part on a different *branch* of the tree,
    the wrong template could be applied.

    This is really only the case where the user has a very complex set of nested part variants,
    but still there is a potential for a mis-match.

    This data migration will attempt to fix any mis-applied templates.
    """

    PartTestTemplate = apps.get_model('part', 'PartTestTemplate')
    StockItemTestResult = apps.get_model('stock', 'StockItemTestResult')

    # Find any StockItemTestResult objects which match a "bad" template
    # Here a "bad" template points to a Part which is not *above* the part in the tree
    bad_results = StockItemTestResult.objects.exclude(
        stock_item__part__tree_id=F('template__part__tree_id'),
        stock_item__part__lft__gte=F('template__part__lft'),
        stock_item__part__rght__lte=F('template__part__rght'),
    )

    n = bad_results.count()

    if n == 0:
        # Escape early - no bad results!
        return
    
    print(f"Found {n} StockItemTestResult objects with bad templates...")

    # For each bad result, attempt to find a matching template
    # Here, a matching template must point to a part *above* the part in the tree
    # Annotate the queryset with a "matching template"

    template_query = PartTestTemplate.objects.filter(
        part__tree_id=OuterRef('stock_item__part__tree_id'),
        part__lft__lte=OuterRef('stock_item__part__lft'),
        part__rght__gte=OuterRef('stock_item__part__rght'),
        key=OuterRef('template__key')
    ).order_by('part__level').values('pk')

    bad_results = bad_results.annotate(
        matching_template=Subquery(template_query[:1], output_field=IntegerField())
    )

    # Update the results for which we have a "good" matching template
    matching_results = bad_results.filter(matching_template__isnull=False)
    missing_results = bad_results.filter(matching_template__isnull=True)

    results_to_update = []

    for result in matching_results:
        if result.template.pk != result.matching_template:
            result.template = PartTestTemplate.objects.get(pk=result.matching_template)
            results_to_update.append(result)

    if len(results_to_update) > 0:
        # Update any results which point to the wrong template, but have a matching template
        print("Updating", len(results_to_update), "matching templates...")
        StockItemTestResult.objects.bulk_update(results_to_update, ['template'])

    results_to_update = []

    # For the remaining results, we need to create a new template
    for result in missing_results:
        # Check that a template does *not* exist already
        if template := PartTestTemplate.objects.filter(
            part__tree_id=result.stock_item.part.tree_id,
            part__lft__lte=result.stock_item.part.lft,
            part__rght__gte=result.stock_item.part.rght,
            key=result.template.key
        ).first():
            pass
        else:
            # Create a new template (by copying the old one)
            template = result.template
            template.part = result.stock_item.part
            template.pk = None
            template.save()
            template.refresh_from_db()

        result.template = template
        results_to_update.append(result)

    if len(results_to_update) > 0:
        print("Updating", len(results_to_update), "missing templates...")
        StockItemTestResult.objects.bulk_update(results_to_update, ['template'])  

    # Finall, check that there are no longer any "bad" results
    assert(bad_results.order_by('pk').count() == 0)


class Migration(migrations.Migration):

    dependencies = [
        ('stock', '0107_remove_stockitemtestresult_test_and_more'),
    ]

    operations = [
        migrations.RunPython(update_templates, reverse_code=migrations.RunPython.noop)
    ]
